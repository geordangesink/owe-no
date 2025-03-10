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
const ReadyResource = require('ready-resource')

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
class RoomManager extends ReadyResource {
  constructor(storageDir) {
    super()
    this.storageDir = storageDir || './storage'
    this.corestore = new Corestore(this.storageDir)
    this.localBee = null
    this.swarm = new Hyperswarm()
    this.pairing = new BlindPairing(this.swarm)
    this.rooms = {}
    this.discoveryKeys = new Set()

    this.ready().catch(noop)
  }

  async _open() {
    await this.corestore.ready()
    this.localBee = new Hyperbee(
      this.corestore.namespace('localData').get({ name: 'localBee' }),
      {
        keyEncoding: 'utf-8',
        valueEncoding: c.any
      }
    )
    await this.localBee.ready()
    const roomsInfo = await this.localBee.get('roomsInfo')
    if (roomsInfo && roomsInfo.value) {
      const roomsInfoMap = jsonToMap(roomsInfo.value.toString())
      for (const [roomId, infoMap] of roomsInfoMap) {
        const info = infoMap.get('info')
        const userName = infoMap.get('userName')
        await this.initRoom({ info, roomId, userName })
      }
    }
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
   * @returns {Room} New room instance
   */
  async initRoom(opts = {}) {
    let room
    const roomId = opts.roomId || generateRoomId()
    const baseOpts = { ...opts, roomId, ...this.getRoomOptions(roomId) }
    if (opts.inviteInput) {
      // check for invalid invite or already joined
      const discoveryKey = await this.getDiscoveryKey(opts.inviteInput)
      if (discoveryKey === 'invalid') return false
      else if (discoveryKey) return this._findRoom(discoveryKey)

      const pair = RoomManager.pair(opts.inviteInput, baseOpts)
      room = await pair.finished()
    } else {
      room = new Room(baseOpts)
      await room.ready()
    }
    // save room if its new
    if (opts.isNew) room.on('allDataThere', () => this.saveRoom(room))
    room.on('leaveRoom', () => this.deleteRoom(room))

    this.rooms[roomId] = room
    room.on('roomClosed', () => {
      delete this.rooms[roomId]
      if (this.closingDown) return
      if (Object.keys(this.rooms).length > 0) return
      queueMicrotask(() => this.emit('lastRoomClosed'))
    })
    queueMicrotask(() => this.emit('newRoom', room))

    if (!this.discoveryKeys.has(room.discoveryKey))
      this.discoveryKeys.add(room.discoveryKey)

    return room
  }

  /**
   * when joining an existing room
   * @param {Object} opts
   */
  static pair(invite, opts = {}) {
    const store = opts.corestore
    return new RoomPairer(store, invite, opts)
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
    // TODO: purge storage of corestore namespace

    const roomsInfoDb = await this.localBee.get('roomsInfo')
    const roomsInfoMap = roomsInfoDb
      ? jsonToMap(roomsInfoDb.value.toString())
      : new Map()
    if (!roomsInfoMap.has(room.roomId)) {
      roomsInfoMap.delete(room.roomId)
      await this.localBee.put('roomsInfo', Buffer.from(mapToJson(roomsInfoMap)))
    }
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

class RoomPairer extends ReadyResource {
  constructor(store, invite, opts = {}) {
    super()
    this.info = opts.info
    this.roomId = opts.roomId
    this.store = store
    this.invite = invite
    this.swarm = opts.swarm
    this.pairing = opts.pairing
    this.candidate = null
    this.bootstrap = opts.bootstrap || null
    this.onresolve = null
    this.onreject = null
    this.room = null

    this.ready()
  }

  async _open() {
    const store = this.store
    this.swarm.on('connection', (connection, peerInfo) => {
      store.replicate(connection)
    })
    if (!this.pairing) this.pairing = new BlindPairing(this.swarm)
    const core = Autobee.getLocalCore(this.store)
    await core.ready()
    const key = core.key
    await core.close()
    this.candidate = this.pairing.addCandidate({
      invite: z32.decode(this.invite),
      userData: key,
      onadd: async (result) => {
        if (this.room === null) {
          this.room = new Room({
            corestore: this.store,
            swarm: this.swarm,
            pairing: this.pairing,
            key: result.key,
            encryptionKey: result.encryptionKey,
            bootstrap: this.bootstrap,
            isNew: true,
            info: this.info,
            roomId: this.roomId
          })
        }
        this.swarm = null
        this.store = null
        if (this.onresolve) this._whenWritable()
        this.candidate.close().catch(noop)
      }
    })
  }

  _whenWritable() {
    if (this.room.autobee.writable) return
    const check = () => {
      if (this.room.autobee.writable) {
        this.room.autobee.off('update', check)
        this.onresolve(this.room)
      }
    }
    this.room.autobee.on('update', check)
  }

  async _close() {
    if (this.candidate !== null) {
      await this.candidate.close()
    }

    if (this.swarm !== null) {
      await this.swarm.destroy()
    }

    if (this.store !== null) {
      await this.store.close()
    }

    if (this.onreject) {
      this.onreject(new Error('Pairing closed'))
    } else if (this.autobee) {
      await this.autobee.close()
    }
  }

  finished() {
    return new Promise((resolve, reject) => {
      this.onresolve = resolve
      this.onreject = reject
    })
  }
}

/**
 * @typedef {Object} RoomOptions
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
class Room extends ReadyResource {
  constructor(opts = {}) {
    super()
    this.info = opts.info || {}
    this.roomId = opts.roomId || generateRoomId()
    this.key = opts.key
    this.isNew = opts.isNew

    this.corestore =
      opts.corestore ||
      (opts.storageDir
        ? new Corestore(opts.storageDir)
        : new Corestore(RAM.reusable()))
    this.swarm = opts.swarm || new Hyperswarm()
    this.pairing = opts.pairing || new BlindPairing(this.swarm)
    this.member = null
    this.replicate = opts.replicate !== false
    this.autobee = null
    this.invite = ''
    this.myId = null

    this._boot(opts)
    this.ready()
  }

  _boot(opts = {}) {
    const { encryptionKey, key } = opts

    this.autobee =
      opts.autobee ||
      new Autobee(this.corestore, key, {
        encrypt: true,
        encryptionKey: encryptionKey,
        apply,
        valueEncoding: c.any
      }).on('error', (err) =>
        console.error('An error occurred in Autobee:', err)
      )

    this.autobee.on('update', () => {
      if (!this.autobee._interrupting) this.emit('update')
    })
  }

  /**
   * Initializes the room and sets up event handlers
   * @returns {Promise<string|void>} Returns invite code if room is host
   */
  async _open() {
    if (!this.replicate) return
    await this.autobee.ready()
    this.myId = z32.encode(this.autobee.local.key)

    this.swarm.on('connection', async (conn) => {
      await this.corestore.replicate(conn)
    })
    this.pairing = new BlindPairing(this.swarm)
    this.member = this.pairing.addMember({
      discoveryKey: this.autobee.discoveryKey,
      onadd: (candidate) => this._onAddMember(candidate)
    })
    await this.member.flushed()
    this.opened = true
    this.invite = await this.createInvite()
    if (this.isNew) {
      const roomInfo = await this.autobee.get('roomInfo')

      if (roomInfo) {
        roomInfo.members = {
          ...roomInfo.members,
          [this.myId]: {
            name: this.info.userName
          }
        }
        this.info = roomInfo
      } else {
        this.info.members = {
          [this.myId]: {
            name: this.info.userName
          }
        }
      }

      await this.autobee.put('roomInfo', this.info)
    }
    this.emit('allDataThere')
    this._joinTopic()
  }

  async createInvite() {
    if (this.opened === false) await this.ready()
    const existing = await this.autobee.get('inviteInfo')
    if (existing) return existing.invite

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
    return record.invite
  }

  async _onAddMember(candidate) {
    const id = z32.encode(candidate.inviteId)
    const inviteInfo = await this.autobee.get('inviteInfo')
    if (inviteInfo.id !== id) return

    candidate.open(z32.decode(inviteInfo.publicKey))
    await this._connectOtherCore(candidate.userData)
    candidate.confirm({
      key: this.autobee.key,
      encryptionKey: this.autobee.encryptionKey
    })
  }

  async _connectOtherCore(key) {
    await this.autobee.append({ type: 'addWriter', key })
    this.emit('peerEntered', z32.encode(key))
  }

  async _joinTopic() {
    try {
      const discovery = this.swarm.join(this.autobee.discoveryKey)
      await discovery.flushed()
    } catch (err) {
      console.error('Error joining swarm topic', err)
    }
  }

  async leave() {
    if (this.autobee.writable) {
      if (this.autobee.activeWriters.size > 1) {
        await this.autobee.append({
          type: 'removeWriter',
          key: this.autobee.local.key
        })
      }
    }
    await this.exit()
    this.emit('leaveRoom')
  }

  async exit() {
    await this.member.close()
    await this.autobee.update()
    this.swarm.leave(this.autobee.discoveryKey)
    await this.autobee.close()
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

function noop() {}

module.exports = RoomManager
