import RPC from 'bare-rpc'
import fs from 'bare-fs'
import b4a from 'b4a'
import z32 from 'z32'
import sodium from 'sodium-native'
import RoomManager from './lib/RoomManager'
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
  const roomManager = new RoomManager(storagePath)
  await roomManager.ready()
  let defaultUserName = 'Unnamed User'

  Bare.on('beforeExit', cleanup)
  async function cleanup() {
    await roomManager.cleanup()
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

      const room = await roomManager.initRoom({
        inviteInput: inviteKey,
        isNew: true,
        info: { userName: defaultUserName }
      })
      logToFrontend(z32.encode(room.autobee.key))
      logToFrontend(z32.encode(room.autobee.discoveryKey))
      logToFrontend(room.myId)
      logToFrontend(JSON.stringify(room.info))
      addAutobeeListener(room)
    }

    if (req.command === 'createRoom') {
      logToFrontend('Creating a new room...')
      // get room info from frontend
      const parsedData = JSON.parse(b4a.toString(req.data))
      const info = {
        ...parsedData,
        expenditures: {},
        transfers: {},
        userName: defaultUserName
      }
      // create room and add update listener
      const room = await roomManager.initRoom({ isNew: true, info })

      addAutobeeListener(room)
      const roomInfo = {
        ...room.info,
        roomId: room.roomId,
        invite: room.invite
      }
      const newReq = rpc.request('newRoom')
      newReq.send(JSON.stringify(roomInfo))
      logToFrontend(z32.encode(room.autobee.key))
      logToFrontend(z32.encode(room.autobee.discoveryKey))
      logToFrontend(room.myId)
      logToFrontend(`Invite key: ${room.invite}`)
    }

    if (req.command === 'leaveRoom') {
      logToFrontend('leaving room...')
      const roomId = b4a.toString(req.data)
      const room = roomManager.rooms[roomId]
      await room.leave()
      logToFrontend('left room!')
      delete roomManager.rooms[roomId]

      const newReq = rpc.request('deleteRoom')
      newReq.send(roomId)
    }

    if (req.command === 'saveExpenditure') {
      logToFrontend('saving Expenditure')
      const parsedData = JSON.parse(b4a.toString(req.data))

      const roomId = parsedData.roomId
      const expenditure = parsedData.expenditure
      if (!expenditure.creator)
        expenditure.creator = roomManager.rooms[roomId].myId
      const expenditureKey = Buffer.alloc(32)

      if (!expenditure.id) {
        sodium.randombytes_buf(expenditureKey)
        expenditure.id = b4a.toString(expenditureKey, 'hex')
      }

      try {
        const roomInfo = await roomManager.rooms[roomId].autobee.get('roomInfo')
        roomInfo.expenditures = {
          ...roomInfo.expenditures,
          [expenditure.id]: expenditure
        }

        logToFrontend(JSON.stringify(calculateTransfers(roomInfo)))
        // TODO: Need to add "deprecated"
        roomInfo.transfers = calculateTransfers(roomInfo)

        await roomManager.rooms[roomId].autobee.put('roomInfo', roomInfo)
      } catch (err) {
        console.error('Error writing to Autobee:', err)
      }
    }

    if (req.command === 'deleteExpenditure') {
      logToFrontend('deleting Expenditure')
      const parsedData = JSON.parse(b4a.toString(req.data))
      const roomId = parsedData.roomId
      const expenditureId = parsedData.expenditureId
      try {
        const roomInfo = await roomManager.rooms[roomId].autobee.get('roomInfo')
        if (expenditureId in roomInfo.expenditures) {
          delete roomInfo.expenditures[expenditureId]

          logToFrontend(JSON.stringify(calculateTransfers(roomInfo)))
          // TODO: Need to add "deprecated"
          roomInfo.transfers = calculateTransfers(roomInfo)
          await roomManager.rooms[roomId].autobee.put('roomInfo', roomInfo)
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
      roomManager.rooms[roomId].info.userName = username
      roomManager.updateRoomInfo(roomManager.rooms[roomId])
      try {
        const roomInfo = await roomManager.rooms[roomId].autobee.get('roomInfo')
        if (roomInfo.members[roomManager.rooms[roomId].myId]) {
          roomInfo.members[roomManager.rooms[roomId].myId].name = username
        }
        await roomManager.rooms[roomId].autobee.put('roomInfo', roomInfo)
      } catch (err) {
        console.error('Error writing to Autobee:', err)
      }
    }

    if (req.command === 'settleDebt') {
      const parsedData = JSON.parse(b4a.toString(req.data))
      const transferId = parsedData.transferId
      const roomId = parsedData.roomId
      try {
        const roomInfo = await roomManager.rooms[roomId].autobee.get('roomInfo')
        // on matching id, switch true/false settled state
        Object.keys(roomInfo.transfers).forEach((id) =>
          transferId === id
            ? roomInfo.transfers[id].settled === true
              ? (roomInfo.transfers[id].settled = false)
              : (roomInfo.transfers[id].settled = true)
            : null
        )
        await roomManager.rooms[roomId].autobee.put('roomInfo', roomInfo)
      } catch (err) {
        console.error('Error writing to Autobee', err)
      }
    }
  })

  logToFrontend('Worklet started!')

  async function openSavedRooms() {
    for (const roomId in roomManager.rooms) {
      logToFrontend(`opening room: ${roomId}`)
      const room = roomManager.rooms[roomId]
      const beeInfo = await room.autobee.get('roomInfo')
      updateRoom(beeInfo, room)
      addAutobeeListener(roomManager.rooms[roomId])
    }
  }
  openSavedRooms()

  function logToFrontend(message) {
    const req = rpc.request('logMessage')
    req.send(message)
  }

  function updateRoom(update, room) {
    const req = rpc.request('newEntry')
    if (update) {
      const newInfo = {
        ...update,
        roomId: room.roomId,
        myId: room.myId,
        invite: room.invite
      }

      req.send(JSON.stringify(newInfo))
    }
  }

  function addAutobeeListener(room) {
    room.on('update', async () => {
      logToFrontend('New roomInfo entry detected!')

      const update = await room.autobee.get('roomInfo')

      // currently sends everyting to frontend
      updateRoom(update, room)
    })
  }
}
main()
