import RPC from 'bare-rpc'
import fs from 'bare-fs'
import b4a from 'b4a'
import z32 from 'z32'
import sodium from 'sodium-native'
import FlockManager from 'flockmanager'
import { calculateTransfers } from './utils/calculateTransfers'

const { IPC } = BareKit

const storagePath =
  Bare.argv[0] === 'android'
    ? '/data/data/com.wsi.oweno/owe-no'
    : './tmp/owe-no/'

if (!fs.existsSync(storagePath)) {
  fs.mkdirSync(storagePath, { recursive: true })
}

// if (fs.existsSync(storagePath)) {
//   fs.rmSync(storagePath, { recursive: true, force: true }) // ❌ Deletes all files
// }
// fs.mkdirSync(storagePath)

async function main() {
  const flockManager = new FlockManager(storagePath)
  await flockManager.ready()
  let defaultUserName = 'Unnamed User'
  await flockManager.setUserData({ name: defaultUserName })

  Bare.on('beforeExit', cleanup)
  async function cleanup() {
    await flockManager.cleanup()
    if (fs.existsSync(storagePath)) {
      try {
        fs.accessSync(storagePath, fs.constants.R_OK | fs.constants.W_OK)
      } catch (err) {}
    }
  }

  const rpc = new RPC(IPC, async (req) => {
    if (req.command === 'joinRoom') {
      logToFrontend('Joining room using invite key...')
      const inviteKey = b4a.toString(req.data)

      const flock = await flockManager.create(inviteKey, {
        custom: { userName: defaultUserName },
        isNew: true
      }, true)
      if (!flock) {
        logToFrontend('Invalid invite or already joined')
        return
      }
      logToFrontend(z32.encode(flock.autobee.key))
      logToFrontend(z32.encode(flock.autobee.discoveryKey))
      logToFrontend(flock.myId)
      const roomInfo = await flock.get('roomInfo')
      logToFrontend(JSON.stringify(roomInfo || flock.custom))
      addFlockListener(flock)
    }

    if (req.command === 'createRoom') {
      logToFrontend('Creating a new room...')
      const parsedData = JSON.parse(b4a.toString(req.data))
      const custom = {
        ...parsedData,
        expenditures: {},
        transfers: {},
        userName: defaultUserName
      }
      const flock = await flockManager.create('', { custom, isNew: true }, true)

      const roomInfo = {
        ...flock.custom,
        members: { [flock.myId]: { name: defaultUserName } },
        expenditures: {},
        transfers: {}
      }
      await flock.set('roomInfo', roomInfo)

      addFlockListener(flock)
      const payload = {
        ...roomInfo,
        roomId: flock.localId,
        myId: flock.myId,
        invite: flock.invite
      }
      const newReq = rpc.request('newRoom')
      newReq.send(JSON.stringify(payload))
      logToFrontend(z32.encode(flock.autobee.key))
      logToFrontend(z32.encode(flock.autobee.discoveryKey))
      logToFrontend(flock.myId)
      logToFrontend(`Invite key: ${flock.invite}`)
    }

    if (req.command === 'leaveRoom') {
      logToFrontend('leaving room...')
      const roomId = b4a.toString(req.data)
      const flock = flockManager.all[roomId]
      if (!flock) {
        logToFrontend('room not found')
        return
      }
      await flock.leave()
      logToFrontend('left room!')
      delete flockManager.all[roomId]

      const newReq = rpc.request('deleteRoom')
      newReq.send(roomId)
    }

    if (req.command === 'saveExpenditure') {
      logToFrontend('saving Expenditure')
      const parsedData = JSON.parse(b4a.toString(req.data))

      const roomId = parsedData.roomId
      const expenditure = parsedData.expenditure
      const flock = flockManager.all[roomId]
      if (!flock) return
      if (!expenditure.creator) expenditure.creator = flock.myId
      const expenditureKey = Buffer.alloc(32)

      if (!expenditure.id) {
        sodium.randombytes_buf(expenditureKey)
        expenditure.id = b4a.toString(expenditureKey, 'hex')
      }

      try {
        const roomInfo = await flock.get('roomInfo') || {}
        roomInfo.expenditures = {
          ...(roomInfo.expenditures || {}),
          [expenditure.id]: expenditure
        }
        logToFrontend(JSON.stringify(calculateTransfers(roomInfo)))
        roomInfo.transfers = calculateTransfers(roomInfo)
        await flock.set('roomInfo', roomInfo)
      } catch (err) {
        console.error('Error writing to Autobee:', err)
      }
    }

    if (req.command === 'deleteExpenditure') {
      logToFrontend('deleting Expenditure')
      const parsedData = JSON.parse(b4a.toString(req.data))
      const roomId = parsedData.roomId
      const expenditureId = parsedData.expenditureId
      const flock = flockManager.all[roomId]
      if (!flock) return
      try {
        const roomInfo = await flock.get('roomInfo') || {}
        if (roomInfo.expenditures && expenditureId in roomInfo.expenditures) {
          delete roomInfo.expenditures[expenditureId]
          logToFrontend(JSON.stringify(calculateTransfers(roomInfo)))
          roomInfo.transfers = calculateTransfers(roomInfo)
          await flock.set('roomInfo', roomInfo)
        }
      } catch (err) {
        console.error('Error in updating Autobee', err)
      }
    }

    if (req.command === 'changeUsername') {
      logToFrontend('changing username')
      const parsedData = JSON.parse(b4a.toString(req.data))
      const roomId = parsedData.roomId
      const username = parsedData.username
      defaultUserName = username
      await flockManager.setUserData({ name: username })
      const flock = flockManager.all[roomId]
      if (!flock) return
      try {
        const roomInfo = await flock.get('roomInfo') || {}
        if (roomInfo.members && roomInfo.members[flock.myId]) {
          roomInfo.members[flock.myId].name = username
        }
        await flock.set('roomInfo', roomInfo)
      } catch (err) {
        console.error('Error writing to Autobee:', err)
      }
    }

    if (req.command === 'settleDebt') {
      const parsedData = JSON.parse(b4a.toString(req.data))
      const transferId = parsedData.transferId
      const roomId = parsedData.roomId
      const flock = flockManager.all[roomId]
      if (!flock) return
      try {
        const roomInfo = await flock.get('roomInfo') || {}
        if (roomInfo.transfers) {
          Object.keys(roomInfo.transfers).forEach((id) =>
            transferId === id
              ? roomInfo.transfers[id].settled === true
                ? (roomInfo.transfers[id].settled = false)
                : (roomInfo.transfers[id].settled = true)
              : null
          )
          await flock.set('roomInfo', roomInfo)
        }
      } catch (err) {
        console.error('Error writing to Autobee', err)
      }
    }
  })

  logToFrontend('Worklet started!')

  async function openSavedRooms() {
    for (const localId in flockManager.all) {
      logToFrontend(`opening room: ${localId}`)
      const flock = flockManager.all[localId]
      const roomInfo = await flock.get('roomInfo')
      updateRoom(roomInfo, flock)
      addFlockListener(flock)
    }
  }
  openSavedRooms()

  function logToFrontend(message) {
    const req = rpc.request('logMessage')
    req.send(message)
  }

  function updateRoom(update, flock) {
    const req = rpc.request('newEntry')
    if (update) {
      const newInfo = {
        ...update,
        roomId: flock.localId,
        myId: flock.myId,
        invite: flock.invite
      }

      req.send(JSON.stringify(newInfo))
    }
  }

  function addFlockListener(flock) {
    flock.on('update', async () => {
      logToFrontend('New roomInfo entry detected!')

      const update = await flock.get('roomInfo')

      updateRoom(update, flock)
    })
  }
}
main()
