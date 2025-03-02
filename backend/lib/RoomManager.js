const { jsonToMap, mapToJson } = require('../utils/parseMapJson')
const Autobee = require('./Autobee')
const BlindPairing = require('blind-pairing')
const Corestore = require('corestore')
const Hyperswarm = require('hyperswarm')
const Hyperbee = require('hyperbee')
const RAM = require('random-access-memory')
const z32 = require('z32')
const b4a = require('b4a')
const c = require('compact-encoding')
const sodium = require('sodium-native')
const { EventEmitter } = require('events')

/**
 * POSSIBLE IMPROVEMENTS
 * make invite key persis (when closing but not added yet and then re-open (pending invites))
 * invite key across room members (allows other room members to accept join)
 * see https://github.com/holepunchto/autopass/blob/main/index.js#L42-L64
 */

/**
 * Creates, saves and manages all calendar rooms
 *
 * @typedef {Object} RoomManagerOptions
 * @property {string} [storageDir] - Optional storage directory path
 * @property {Corestore} [corestore] - Corestore instance
 * @property {Hyperbee} [localBee] - local hyperbee for personal storage (for now)
 * @property {Hyperswarm} [swarm] - Hyperswarm instance
 * @property {BlindPairing} [pairing] - BlindPairing instance
 * @property {Object} [rooms] - roomId key and room instance value
 * @property {Set} [discoveryKeys] - joined rooms dicovery keys
 */
class RoomManager extends EventEmitter {
  constructor(storageDir) {
    super()
    this.storageDir = storageDir || './calendarStorage'
    this.corestore = new Corestore(this.storageDir)
    this._localBee = null
    this.swarm = new Hyperswarm()
    this.pairing = new BlindPairing(this.swarm)
    this.rooms = {}
    this.discoveryKeys = new Set()
  }

  get localBee() {
    if (!this._localBee) {
      throw new Error('localBee is not ready. Did you call `await ready()`?')
    }
    return this._localBee
  }

  /**
   * waits till localBee is ready and all rooms are initiated
   */
  async ready() {
    await this.corestore.ready()
    this._localBee = new Hyperbee(
      this.corestore.namespace('localData').get({ name: 'localBee' }),
      {
        keyEncoding: 'utf-8',
        valueEncoding: c.any
      }
    )
    await this._localBee.ready()
    await this.openAllReadyRooms()
  }

  /**
   * Gets configuration options for a new room
   * @param {string} roomId - Unique room identifier
   * @returns {Object} Room configuration options
   */
  getRoomOptions(roomId) {
    const corestore = roomId ? this.corestore.namespace(roomId) : this.corestore
    return { corestore, swarm: this.swarm, pairing: this.pairing }
  }

  /**
   * initializes a room (bypasses joinability check)
   * (or creates if no roomId provided)
   * @param {Object} [opts={}] - Room configuration options
   * @param {string} [opts.inviteInput] - Optional invite code to join
   * @param {Object} [opts.metadata] - Optional room metadata
   * @returns {CalendarRoom} New room instance
   */
  initRoom(opts = {}) {
    const roomId = opts.roomId || generateRoomId()
    const baseOpts = this.getRoomOptions(roomId)
    baseOpts.metadata = opts.metadata || {}
    baseOpts.roomId = roomId
    baseOpts.info = opts.info
    const room = new CalendarRoom(baseOpts)
    if (opts.isNew) room.on('allDataThere', () => this.saveRoom(room))

    this.rooms[roomId] = room
    room.on('roomClosed', () => {
      delete this.rooms[roomId]
      if (this.closingDown) return
      if (Object.keys(this.rooms).length > 0) return
      queueMicrotask(() => this.emit('lastRoomClosed'))
    })
    queueMicrotask(() => this.emit('newRoom', room))

    return room
  }

  /**
   * initializes a ready room and checks if room is alredy joined and invite is valid
   * @param {Object} [opts={}] - Room configuration options
   * @returns {CalendarRoom} - New room instance and coresponding inviteKey
   */
  async initReadyRoom(opts = {}) {
    if (opts.inviteInput) {
      const discoveryKey = await this.getDiscoveryKey(opts.inviteInput)
      if (discoveryKey === 'invalid') return false
      else if (discoveryKey) return this._findRoom(discoveryKey)
    }
    const room = this.initRoom(opts)
    await room.ready(opts.inviteInput)
    if (!this.discoveryKeys.has(room.discoveryKey))
      this.discoveryKeys.add(room.discoveryKey)

    queueMicrotask(() => this.emit('readyRoom', room))
    return room
  }

  async updateRoomInfo(room) {
    try {
      const roomsInfoDb = await this.localBee.get('roomsInfo')
      const roomsInfoMap = jsonToMap(roomsInfoDb.value.toString())
      roomsInfoMap.get(room.roomId).set('info', room.info)
      await this.localBee.put('roomsInfo', Buffer.from(mapToJson(roomsInfoMap)))
    } catch (err) {
      console.error('error updating room. does the room exist?', err)
    }
  }

  async openAllReadyRooms() {
    const roomsInfo = await this.localBee.get('roomsInfo')
    if (roomsInfo && roomsInfo.value) {
      const roomsInfoMap = jsonToMap(roomsInfo.value.toString())
      for (const [roomId, infoMap] of roomsInfoMap) {
        const info = infoMap.get('info')
        const userName = infoMap.get('userName')
        await this.initReadyRoom({ info, roomId, userName })
      }
    }
  }

  async getDiscoveryKey(invite) {
    try {
      const discoveryKey = await BlindPairing.decodeInvite(z32.decode(invite))
        .discoveryKey
      return (
        this.discoveryKeys.has(z32.encode(discoveryKey)) &&
        z32.encode(discoveryKey)
      )
    } catch (err) {
      console.error(`invalid invite key: ${invite}`)
      return 'invalid'
    }
  }

  async deleteRoom(room) {
    // TODO: delete room from storage and db
  }

  /**
   *  store folder key and room id in personal db
   */
  async saveRoom(room) {
    const roomsInfoDb = await this.localBee.get('roomsInfo')
    const roomsInfoMap = roomsInfoDb
      ? jsonToMap(roomsInfoDb.value.toString())
      : new Map()
    if (!roomsInfoMap.has(room.roomId)) {
      const detailsMap = new Map([['info', room.info]])
      roomsInfoMap.set(room.roomId, detailsMap)
      await this.localBee.put('roomsInfo', Buffer.from(mapToJson(roomsInfoMap)))
    }
  }

  async _findRoom(discoveryKey) {
    for (const roomId in this.rooms) {
      if (
        z32.encode(this.rooms[roomId].metadata.discoveryKey) === discoveryKey
      ) {
        return this.rooms[roomId]
      }
    }
  }

  async cleanup() {
    const exitPromises = Object.values(this.rooms).map((room) => room.exit())
    await Promise.all(exitPromises)
    this.rooms = {}

    // Clean up other resources
    await this.pairing.close()
    await this.swarm.destroy()
    await this.corestore.close()
  }

  isClosingDown() {
    return this.closingDown
  }
}

/**
 * @typedef {Object} CalendarRoomOptions
 * @property {Object} [info] - room info
 * @property {string} [roomId] -  room identifier
 * @property {Corestore} [corestore] - Optional Corestore instance
 * @property {string} [storageDir] - Optional storage directory
 * @property {Hyperswarm} [swarm] - Optional Hyperswarm instance
 * @property {BlindPairing} [pairing] - Optional BlindPairing instance
 * @property {string} [invite] - Optional invite code
 * @property {Object} [metadata] - Optional room metadata
 */

/**
 * Represents a single calendar room for peer-planning
 * @extends EventEmitter
 */
class CalendarRoom extends EventEmitter {
  constructor(opts = {}) {
    super()
    this.info = opts.info || {}
    this.roomId = opts.roomId || generateRoomId()
    this.internalManaged = { corestore: false, swarm: false, pairing: false }
    if (opts.corestore) this.corestore = opts.corestore
    else {
      this.internalManaged.corestore = true
      if (opts.storageDir) this.corestore = new Corestore(opts.storageDir)
      else this.corestore = new Corestore(RAM.reusable())
    }
    this.swarm =
      opts.swarm || ((this.internalManaged.swarm = true), new Hyperswarm())
    this.pairing =
      opts.pairing ||
      ((this.internalManaged.pairing = true), new BlindPairing(this.swarm))
    this.autobee = new Autobee(this.corestore, null, {
      apply,
      valueEncoding: c.any
    }).on('error', (err) => console.error('An error occurred in Autobee:', err))
    this.initialized = false
    this.invite = ''
    this.myId = null
  }

  /**
   * Initializes the room and sets up event handlers
   * @returns {Promise<string|void>} Returns invite code if room is host
   */
  async ready(inviteInput = undefined) {
    if (this.initialized) return this.metadata.permInvite
    this.initialized = true
    await this.autobee.ready()
    this.myId = z32.encode(this.autobee.local.key)

    this.swarm.on('connection', async (conn) => {
      console.log('new peer connected!')
      await this.corestore.replicate(conn)
    })

    if (inviteInput) {
      console.log('candidate')
      const candidate = this.pairing.addCandidate({
        invite: z32.decode(inviteInput),
        userData: this.autobee.local.key,
        onadd: async (result) =>
          this._onHostInvite(result, candidate.discoveryKey)
      })
      await candidate.paring
    } else {
      console.log('member')
      const existing = await this.autobee.get('inviteInfo')
      if (!existing) {
        this.info.members = [
          {
            name: this.info.userName,
            id: z32.encode(this.autobee.local.key)
          }
        ]
        await this.autobee.put('roomInfo', this.info)

        const { id, invite, publicKey, expires } = BlindPairing.createInvite(
          this.autobee.key
        )
        const record = {
          id: z32.encode(id),
          invite: z32.encode(invite),
          publicKey: z32.encode(publicKey),
          expires
        }
        await this.autobee.put('inviteInfo', record)
      }
      const inviteInfo = await this.autobee.get('inviteInfo')
      this.invite = inviteInfo.invite

      const member = this.pairing.addMember({
        discoveryKey: this.autobee.discoveryKey,
        onadd: (candidate) => this._onAddMember(candidate, inviteInfo)
      })
      await member.flushed()
      this.emit('allDataThere')
      this._joinTopic()
    }
  }

  /**
   * TODO
   * NOT IMPLEMENTED YET
   * adjusts the rooms calendar
   * @param {Map} data - Canlendar Map
   * @returns {Promise<void>}
   */
  async _adjustCalendar(data) {}

  async _onHostInvite(result) {
    if (result.key) {
      await this._connectOtherCore(result.key)
    }
    await this.autobee.update()
    this.emit('allDataThere')
    await this._joinTopic()

    const member = this.pairing.addMember({
      discoveryKey: this.autobee.discoveryKey,
      onadd: (candidate) => this._onAddMember(candidate, inviteInfo)
    })
    await member.flushed()
  }

  async _onAddMember(candidate, inviteInfo) {
    console.log('adding member')
    const id = z32.encode(candidate.inviteId)

    if (inviteInfo.id !== id) return

    candidate.open(z32.decode(inviteInfo.publicKey))
    const roomInfo = await this.autobee.get('roomInfo')
    if (roomInfo) {
      roomInfo.members.push({
        name: 'Unnamed User',
        id: z32.encode(candidate.userData)
      })
      await this.autobee.put('roomInfo', roomInfo)
    }
    await this._connectOtherCore(candidate.userData)
    candidate.confirm({
      key: this.autobee.key,
      encryptionKey: this.autobee.encryptionKey
    })
    console.log('added member')
  }

  async _connectOtherCore(key) {
    await this.autobee.append({ type: 'addWriter', key })
    this.emit('peerEntered', z32.encode(key))
  }

  async _joinTopic() {
    try {
      const topicKeyHex = 'rwbs7o58s8wq3zhh3z1z8tnthht5x5r5r8qxcm5wsq7t4mhwz9tq' // Example key
      this.info.topic = topicKeyHex
      const topicKey = z32.decode(topicKeyHex) // Decode to raw bytes
      if (topicKey.length !== 32) {
        throw new Error('Invalid topic key! Must be 32 bytes when decoded.')
      }
      console.log('joining topic on', z32.encode(topicKey))

      const discovery = this.swarm.join(topicKey)
      await discovery.flushed()
    } catch (err) {
      console.error('Error joining swarm topic', err)
    }
  }

  async leave() {
    // TODO: remove self as writer
  }

  async exit() {
    await this.autobee.update()
    this.swarm.leave(this.info.topic)
    await this.autobee.close()
    if (this.internalManaged.pairing) await this.pairing.close()
    if (this.internalManaged.swarm) await this.swarm.destroy()
    if (this.internalManaged.corestore) await this.corestore.close()
    this.emit('roomClosed')
  }

  isClosingDown() {
    return this.closingDown
  }
}

/**
 * Applies updates to autobee
 * @param {Array} batch - Array of nodes to process
 * @param {Object} view - View instance
 * @param {Object} base - Base instance
 * @returns {Promise<void>}
 */
async function apply(batch, view, base) {
  for (const node of batch) {
    const op = node.value

    // handling "updateSchedule" operation: update requests and schedule between shared peers
    if (op.type === 'newUser') {
      const scheduleMap = jsonToMap(op.schedule)
      // TODO: add api to request a new change
      // TODO: add api to calculate free time for both parties (store their sharing calendar in autobee)
    }

    if (op.type === 'addWriter') {
      console.log('\rAdding writer', z32.encode(op.key))
      await base.addWriter(op.key)
      continue
    }

    if (op.type === 'removeWriter') {
      console.log('\rRemoving writer', z32.encode(op.key))
      await base.removeWriter(op.key)
      continue
    }
  }
  // Pass through to Autobee's default apply behavior
  await Autobee.apply(batch, view, base)
}

/**
 * Generates a unique room identifier
 * @returns {string} Unique room ID combining timestamp and random string
 */
function generateRoomId() {
  const timestamp = Date.now().toString(36) // Base36 timestamp
  const random = Math.random().toString(36).slice(2, 5) // 5 random chars
  return `room-${timestamp}-${random}`
}

/**
 * @returns {Buffer} - random buffer topic
 */
function generateTopic() {
  const buffer = Buffer.alloc(32)
  sodium.randombytes_buf(buffer)
  return buffer
}

module.exports = RoomManager
