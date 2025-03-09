import React, { useEffect, useState, useRef } from 'react'
import RNPickerSelect from 'react-native-picker-select'
import {
  Alert,
  ActivityIndicator,
  View,
  Text,
  TextInput,
  Button,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Modal
} from 'react-native'

import Clipboard from '@react-native-clipboard/clipboard'

import { Worklet } from 'react-native-bare-kit'
import bundle from './app.bundle'
import RPC from 'bare-rpc'
import b4a from 'b4a'
import { Float } from 'react-native/Libraries/Types/CodegenTypes'

export default function App() {
  const [rooms, setRooms] = useState<Record<string, Room>>({})
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null)
  const [invite, setInvite] = useState<string>('')
  const [inviteInput, setInviteInput] = useState<string>('')
  const [roomForm, setRoomForm] = useState<Record<string, RoomForm>>({})
  const [isInitialized, setIsInitialized] = useState<boolean>(false)
  const [clickedDebt, setClickedDebt] = useState<string>('')

  const [createRoomModalVisible, setCreateRoomModalVisible] =
    useState<boolean>(false)
  const [expenditureModalVisible, setExpenditureModalVisible] =
    useState<boolean>(false)
  const [usernameModalVisible, setUsernameModalVisible] =
    useState<boolean>(false)
  const [roomDebtsVisible, setRoomDebtsVisible] = useState<boolean>(false)
  const [allInbalancesVisible, setAllInbalancesVisible] =
    useState<boolean>(false)
  const [settleDebtModalVisible, setSettleDebtModalVisible] =
    useState<boolean>(false)

  const [username, setUsername] = useState<string>('')
  const [expenditureForm, setExpenditureForm] = useState<
    Record<string, Expenditure>
  >({})
  const [participants, setParticipants] = useState<Record<string, Participant>>(
    {}
  )
  const rpcRef = useRef<RPC | null>(null)

  useEffect(() => {
    const worklet = new Worklet()
    worklet
      .start('/app.bundle', bundle, [])
      .then(() => {
        const { IPC } = worklet
        rpcRef.current = new RPC(IPC, (req) => {
          if (req.command === 'newRoom' && req.data) {
            const parsedData = JSON.parse(b4a.toString(req.data))
            const newRoom: Room = { ...parsedData }
            setRooms((prevRooms) => ({
              ...prevRooms,
              [newRoom.roomId]: newRoom
            }))
            setInvite(newRoom.invite)
            console.log(newRoom)
          }

          if (req.command === 'newEntry' && req.data) {
            const parsedData = JSON.parse(b4a.toString(req.data))
            const newRoom: Room = { ...parsedData }
            setRooms((prevRooms) => ({
              ...prevRooms,
              [newRoom.roomId]: newRoom
            }))
            console.log(parsedData)
          }

          if (req.command === 'logMessage') {
            console.log('[Worklet Log]:', b4a.toString(req.data))
          }
        })
      })
      .catch((err) => {
        console.error('Error in worklet:', err)
      })
  }, [])

  const joinRoom = () => {
    if (rpcRef.current) {
      const req = rpcRef.current.request('joinRoom')
      req.send(inviteInput)
      setInviteInput('')
      setCreateRoomModalVisible(false)
    } else {
      console.error('No RPC reference stored')
    }
  }

  const createRoom = () => {
    // FIX-BUG: user can change title or emoji back to nothing and crash
    setIsInitialized(true)
    if (rpcRef.current) {
      try {
        const finishedForm = roomForm
        if (!finishedForm.emoji) finishedForm.emoji = '🥶'
        if (!finishedForm.name) finishedForm.name = 'Chill Debtors'
        const req = rpcRef.current.request('createRoom')
        req.send(JSON.stringify(roomForm))
      } catch (err) {
        console.error('error in rpc', err)
      }
    } else {
      console.error('please select title and emoji')
    }
  }

  const closeCreateRoomModal = () => {
    setCreateRoomModalVisible(false)
    setIsInitialized(false)
    setRoomForm({})
  }

  const openRoom = (roomId: string) => {
    setCurrentRoomId(roomId)
  }

  const closeRoom = () => {
    setCurrentRoomId(null)
  }

  const createExpenditure = () => {
    setExpenditureModalVisible(true)
  }

  const deleteExpenditure = () => {
    if (rpcRef.current) {
      const req = rpcRef.current.request('deleteExpenditure')
      // send
    } else {
      console.error('No RPC reference stored')
    }
  }

  const updateExpenditure = () => {
    if (rpcRef.current) {
      const req = rpcRef.current.request('updateExpenditure')
      // send
    } else {
      console.error('No RPC reference stored')
    }
  }

  const saveExpenditure = () => {
    if (
      rpcRef.current &&
      expenditureForm.emoji &&
      expenditureForm.name &&
      Object.keys(participants).length > 0 &&
      Object.values(participants).reduce((acc, c) => acc + c, 0) > 0
    ) {
      const req = rpcRef.current.request('createExpenditure')
      // Send data to save
      const expenditure = {
        name: expenditureForm.name,
        emoji: expenditureForm.emoji,
        participants,
        value: expenditureForm.value
      }
      const data = { expenditure, roomId: currentRoomId }
      req.send(JSON.stringify(data))
      setExpenditureModalVisible(false)
      setParticipants({})

      setExpenditureForm({})
    } else {
      console.error('Please fill out all fields.')
    }
  }

  const handleParticipantChange = (participantId: string, value: number) => {
    setParticipants((prevParticipants) => ({
      ...prevParticipants, // Create a new object to ensure reactivity
      [participantId]: value // Update the specific participant
    }))
  }

  const changeUsername = () => {
    if (rpcRef.current && username) {
      const data = { roomId: currentRoom.roomId, username }
      const req = rpcRef.current.request('changeUsername')
      req.send(JSON.stringify(data))

      setRooms((prev) => ({
        ...prev,
        [currentRoom.roomId]: { ...currentRoom, userName: username }
      }))

      setUsernameModalVisible(false)
    }
  }

  const markSettled = () => {
    if (rpcRef.current && clickedDebt) {
      const data = {
        transferId: clickedDebt,
        roomId: currentRoom.roomId
      }
      const req = rpcRef.current.request('settleDebt')
      req.send(JSON.stringify(data))
    } else {
      console.log('error in rpc of clicked debt')
    }
    setSettleDebtModalVisible(false)

    setClickedDebt('')
  }

  const isExpenditureCreator = (expenditure, myId) => {
    return expenditure.creator === myId
  }

  const getOweByParts = (expenditure, myId) => {
    const value = expenditure.value

    const myParts = expenditure.participants[myId]
    const totalParts = Object.values(expenditure.participants).reduce(
      (acc, c) => acc + c,
      0
    )

    return isExpenditureCreator(expenditure, myId)
      ? value - (value / totalParts) * myParts
      : -((value / totalParts) * myParts)
  }
  /// THESE NEED TO BE UPTDATED (.transfers not .expenditures)
  const getTotalOweValueRoom = (room) => {
    function isMe(transfer) {}

    if (room && room.transfers) {
      const total = Object.values(room.transfers).reduce(
        (acc, transfer) =>
          transfer.to === room.myId
            ? acc + transfer.value
            : transfer.from === room.myId
              ? acc - transfer.value
              : acc + 0,
        0
      )
      return total
    }
    return 0
  }

  const getTotalOweValue = () => {
    const total = Object.values(rooms).reduce(
      (acc, room) => acc + getTotalOweValueRoom(room),
      0
    )
    return total
  }

  const copyToClipboard = () => {
    Clipboard.setString(invite)
    Alert.alert('Copied!', 'Invite has been copied to clipboard.')
  }

  const MultiHighlightText: React.FC<MultiHighlightTextProps> = ({
    text,
    highlights
  }) => {
    let parts: (string | Highlight)[] = [text]

    highlights.forEach(({ word, color }) => {
      parts = parts.flatMap((part) =>
        typeof part === 'string'
          ? part
              .split(new RegExp(`(${word})`, 'gi'))
              .map((subPart) =>
                subPart.toLowerCase() === word.toLowerCase()
                  ? { word: subPart, color }
                  : subPart
              )
          : part
      )
    })

    return (
      <Text>
        {parts.map((part, index) =>
          typeof part === 'string' ? (
            <Text style={{ fontSize: 20, color: '#fff' }} key={index}>
              {part}
            </Text>
          ) : (
            <Text
              key={index}
              style={{
                color: part.color,
                fontSize: 20,
                fontWeight: 'bold'
              }}
            >
              {part.word}
            </Text>
          )
        )}
      </Text>
    )
  }

  const currentRoom = rooms[currentRoomId || '']

  return (
    <View style={styles.container}>
      {/* Transfers Screen */}
      {currentRoomId ? (
        roomDebtsVisible ? (
          allInbalancesVisible ? (
            <View style={styles.roomContainer}>
              <View style={styles.header}>
                <TouchableOpacity
                  onPress={() => setAllInbalancesVisible(false)}
                >
                  <Text style={styles.backButton}>{'<'}</Text>
                </TouchableOpacity>
                <Text style={styles.roomHeader}>
                  {currentRoom?.emoji} {currentRoom?.name}
                </Text>
                <Button
                  title='Change Username'
                  onPress={() => setUsernameModalVisible(true)}
                  color='#FF5733'
                />
              </View>

              <View style={styles.header}>
                <Text style={styles.roomHeader}>
                  {Object.values(currentRoom.transfers).length > 0
                    ? 'Money needs to Move:'
                    : 'All Settled!'}
                </Text>
              </View>

              {/* Inbalances List */}
              <FlatList
                data={Object.values(currentRoom.transfers).slice().reverse()}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => {
                  if (item.from === currentRoom.myId) {
                    return (
                      <View style={styles.roomItem}>
                        <Text style={styles.roomEmoji}>💸</Text>
                        <View style={styles.roomInfo}>
                          <Text
                            style={styles.roomName}
                          >{`${item.value.toFixed(2)} From ${currentRoom.members[item.from].name} To ${currentRoom.members[item.to].name}`}</Text>
                        </View>
                      </View>
                    )
                  } else if (item.to === currentRoom.myId) {
                  }
                }}
              />
            </View>
          ) : (
            <View style={styles.roomContainer}>
              <View style={styles.header}>
                <TouchableOpacity onPress={() => setRoomDebtsVisible(false)}>
                  <Text style={styles.backButton}>{'<'}</Text>
                </TouchableOpacity>
                <Text style={styles.roomHeader}>
                  {currentRoom?.emoji} {currentRoom?.name}
                </Text>
                <Button
                  title='Change Username'
                  onPress={() => setUsernameModalVisible(true)}
                  color='#FF5733'
                />
              </View>

              <View style={styles.header}>
                <Text style={styles.roomHeader}>
                  {Object.values(currentRoom.transfers).length > 0
                    ? 'Settle Your Inbalances:'
                    : "You're Settled!"}
                </Text>
                <Button
                  title='Show All'
                  onPress={() => setAllInbalancesVisible(true)}
                />
              </View>

              {/* Inbalances List */}
              <FlatList
                data={Object.values(currentRoom.transfers).slice().reverse()}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => {
                  if (item.to === currentRoom.myId) {
                    return (
                      <TouchableOpacity
                        style={styles.InbalanceItem}
                        onPress={() => {
                          setClickedDebt(item.id)
                          setSettleDebtModalVisible(true)
                        }}
                      >
                        <MultiHighlightText
                          text={`💰️ ${item.value.toFixed(2)} From ${currentRoom.members[item.from].name}`}
                          highlights={[
                            {
                              word: `${item.value.toFixed(2)}`,
                              color: '#228B22'
                            }
                          ]}
                        />
                      </TouchableOpacity>
                    )
                  } else if (item.from === currentRoom.myId) {
                    return (
                      <TouchableOpacity
                        style={styles.InbalanceItemReverse}
                        onPress={() => {
                          setClickedDebt(item.id)
                          setSettleDebtModalVisible(true)
                        }}
                      >
                        <MultiHighlightText
                          text={`${item.value.toFixed(2)} To ${currentRoom.members[item.to].name} 💸`}
                          highlights={[
                            {
                              word: `${item.value.toFixed(2)}`,
                              color: '#A52A2A'
                            }
                          ]}
                        />
                      </TouchableOpacity>
                    )
                  }
                }}
              />
            </View>
          )
        ) : (
          // Room Screen
          <View style={styles.roomContainer}>
            <View style={styles.header}>
              <TouchableOpacity onPress={closeRoom}>
                <Text style={styles.backButton}>{'<'}</Text>
              </TouchableOpacity>
              <Text style={styles.roomHeader}>
                {currentRoom?.emoji} {currentRoom?.name}
              </Text>
              <Button
                title='Change Username'
                onPress={() => setUsernameModalVisible(true)}
                color='#FF5733'
              />
            </View>
            <TouchableOpacity
              style={styles.header}
              onPress={() => setRoomDebtsVisible(true)}
            >
              <Text style={styles.roomHeader}>
                {getTotalOweValueRoom(currentRoom) < 0
                  ? `You Owe: ${getTotalOweValueRoom(currentRoom).toFixed(2)}`
                  : `You're Owed: ${getTotalOweValueRoom(currentRoom).toFixed(2)}`}
              </Text>
            </TouchableOpacity>

            {/* Create Expenditure Button */}
            <TouchableOpacity
              style={styles.createExpenditureButton}
              onPress={() => createExpenditure()}
            >
              <Text style={styles.createExpenditureButtonText}>
                Create Expenditure
              </Text>
            </TouchableOpacity>

            {/* Expenditures List */}
            <FlatList
              data={Object.values(currentRoom.expenditures).slice().reverse()}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.roomItem}>
                  <Text style={styles.roomEmoji}>{item.emoji}</Text>
                  <View style={styles.roomInfo}>
                    <Text style={styles.roomName}>{item.name}</Text>
                    <Text
                      style={styles.roomMembers}
                    >{`${isExpenditureCreator(item, currentRoom.myId) ? "You're Owed:" : 'You Owe:'} ${getOweByParts(item, currentRoom.myId).toFixed(2)}`}</Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          </View>
        )
      ) : (
        // Room List
        <View style={styles.roomListContainer}>
          <View style={styles.header}>
            <Text style={styles.heading}>Owe-No</Text>
            <TouchableOpacity
              onPress={() => setCreateRoomModalVisible(true)}
              style={styles.addButton}
            >
              <Text style={styles.addButtonText}>+</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.header}>
            <Text style={styles.roomHeader}>
              {getTotalOweValue() < 0
                ? `You Owe: ${getTotalOweValue().toFixed(2)}`
                : `You're Owed: ${getTotalOweValue().toFixed(2)}`}
            </Text>
          </View>

          <FlatList
            data={Object.values(rooms).slice().reverse()}
            keyExtractor={(item) => item.roomId}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.roomItem}
                onPress={() => openRoom(item.roomId)}
              >
                <Text style={styles.roomEmoji}>{item.emoji}</Text>
                <View style={styles.roomInfo}>
                  <Text style={styles.roomName}>{item.name}</Text>
                  <Text style={styles.roomMembers}>
                    Members: {Object.keys(item.members).length}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {/* Settle Debt Modal */}
      <Modal
        animationType='slide'
        transparent={true}
        visible={settleDebtModalVisible}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>
              Do you want to Settle This Debt?
            </Text>

            {/* Action Buttons */}
            <View style={styles.buttonContainer}>
              <Button title='Yes' onPress={markSettled} color='#1E90FF' />
            </View>

            {/* Close Modal */}
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setSettleDebtModalVisible(false)}
            >
              <Text style={styles.closeButtonText}>Cancle</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Expenditure Modal */}
      <Modal
        animationType='slide'
        transparent={true}
        visible={expenditureModalVisible}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            {/* Emoji Picker and Title Input Row */}
            <View style={styles.inputRow}>
              {/* Value Input */}
              <TextInput
                style={[styles.input, { width: '50%' }]} // Title input on the right, reduced width
                placeholder='Enter A Title'
                value={expenditureForm.name}
                onChangeText={(name) =>
                  setExpenditureForm((prev) => ({ ...prev, name }))
                }
              />
            </View>
            <View style={styles.inputRow}>
              {/* Emoji Picker */}
              <View style={styles.emojiPicker}>
                <RNPickerSelect
                  onValueChange={(emoji) =>
                    setExpenditureForm((prev) => ({ ...prev, emoji }))
                  } // Set the selected emoji
                  value={expenditureForm.emoji}
                  items={[
                    { label: '😀', value: '😀' },
                    { label: '🍕', value: '🍕' },
                    { label: '💸', value: '💸' },
                    { label: '🎉', value: '🎉' },
                    { label: '🚗', value: '🚗' },
                    { label: '🏠', value: '🏠' }
                  ]}
                  style={{
                    inputAndroid: styles.emojiInput, // Android styling
                    inputIOS: styles.emojiInput // iOS styling
                  }}
                />
              </View>

              {/* Value Input */}
              <TextInput
                style={[styles.input, { width: '50%' }]} // Title input on the right, reduced width
                keyboardType='numeric'
                placeholder='value'
                value={expenditureForm.value}
                onChangeText={(value) =>
                  setExpenditureForm((prev) => ({
                    ...prev,
                    value: value.replace(/[^0-9]/g, '')
                  }))
                }
              />
            </View>

            {/* Participants */}
            <View style={styles.participantList}>
              {currentRoom &&
                Object.entries(currentRoom.members).map(([id, member]) => (
                  <View key={id} style={styles.participantItem}>
                    <Text style={styles.participantName}>{member.name}</Text>
                    <View style={styles.participantAmount}>
                      <Button
                        title='-'
                        onPress={() =>
                          handleParticipantChange(
                            id, // pass the member id
                            Math.max(0, participants[id] - 1) // adjust the participants count for this member
                          )
                        }
                      />
                      <Text style={styles.amountText}>
                        {participants[id] || 0}{' '}
                        {/* show the participant count, default to 0 if undefined */}
                      </Text>
                      <Button
                        title='+'
                        onPress={() =>
                          handleParticipantChange(
                            id, // pass the member id
                            (participants[id] || 0) + 1 // increment the participants count for this member
                          )
                        }
                      />
                    </View>
                  </View>
                ))}
            </View>

            {/* Action Buttons */}
            <View style={styles.buttonContainer}>
              <Button title='Save' onPress={saveExpenditure} color='#1E90FF' />
              <Button
                title='Delete'
                onPress={deleteExpenditure}
                color='#FF5733'
              />
            </View>

            {/* Close Modal */}
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setExpenditureModalVisible(false)}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal for Adding a Room */}
      <Modal
        animationType='slide'
        transparent={true}
        visible={createRoomModalVisible}
      >
        {!isInitialized ? (
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <Text style={styles.modalTitle}>New Room</Text>

              {/* Invite Input */}
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  placeholder='Enter invite key...'
                  placeholderTextColor='#aaa'
                  value={inviteInput}
                  onChangeText={setInviteInput}
                />
                <Button title='Join Room' onPress={joinRoom} color='#b0d943' />
              </View>

              {/* Room Creation Form */}
              <View style={styles.inputRow}>
                {/* Emoji Picker */}
                <View style={styles.emojiPicker}>
                  <RNPickerSelect
                    onValueChange={(emoji) =>
                      setRoomForm((prev) => ({ ...prev, emoji }))
                    }
                    value={roomForm.emoji}
                    items={[
                      { label: '😀', value: '😀' },
                      { label: '🕺', value: '🕺' },
                      { label: '⛷️', value: '⛷️' },
                      { label: '🚢', value: '🚢' },
                      { label: '🏖️', value: '🏖️' },
                      { label: '🇯🇵', value: '🇯🇵' }
                    ]}
                    style={{
                      inputAndroid: styles.emojiInput,
                      inputIOS: styles.emojiInput
                    }}
                  />
                </View>

                {/* Room Name Input */}
                <TextInput
                  style={[styles.input, { width: '80%' }]}
                  placeholder='Room Name'
                  placeholderTextColor='#aaa'
                  value={roomForm.name}
                  onChangeText={(name) =>
                    setRoomForm((prev) => ({ ...prev, name }))
                  }
                />
              </View>

              {/* Action Buttons */}
              <View style={styles.buttonContainer}>
                <Button
                  title='Create Room'
                  onPress={createRoom}
                  color='#1E90FF'
                />
              </View>

              {/* Close Modal */}
              <TouchableOpacity
                style={styles.closeButton}
                onPress={closeCreateRoomModal}
              >
                <Text style={styles.closeButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <Text style={styles.modalTitle}>
                {roomForm.emoji} {roomForm.name}
              </Text>

              {/* Created Invite */}
              {invite ? (
                <TouchableOpacity onPress={copyToClipboard}>
                  <Text style={styles.roomMembers}>{invite}</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.container}>
                  <ActivityIndicator size='large' color='#666' />
                </View>
              )}

              {/* Close Modal */}
              <TouchableOpacity
                style={styles.closeButton}
                onPress={closeCreateRoomModal}
              >
                <Text style={styles.closeButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </Modal>

      {/* Modal for Editing UserName */}
      <Modal
        animationType='slide'
        transparent={true}
        visible={usernameModalVisible}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Edit Username</Text>

            {/* username edit Form */}
            <View style={styles.inputRow}>
              {/* user Name Input */}
              <TextInput
                style={[styles.input, { width: '80%' }]}
                placeholder={currentRoom?.userName}
                value={username}
                onChangeText={(text) => setUsername(text)}
              />
            </View>

            {/* Action Buttons */}
            <View style={styles.buttonContainer}>
              <Button title='Save' onPress={changeUsername} color='#1E90FF' />
            </View>

            {/* Close Modal */}
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setUsernameModalVisible(false)}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

type RoomForm = {
  roomId: string
  emoji: string
  name: string
}

type Room = {
  myId: string
  roomId: string
  emoji: string
  userName: string
  name: string
  members: Record<string, Member>
  expenditures: Record<string, Expenditure>
  transfers: Record<string, Transfer>
  invite: string
}

type Transfer = {
  id: string
  date: number
  from: string
  to: string
  value: Float
  settled: boolean
  deprecated: boolean
}

type Expenditure = {
  id: string
  creator: string
  emoji: string
  name: string
  participants: Array<Participant>
  value: Float
}

type Member = {
  name: string
}

// key is the participants ID
type Participant = {
  parts: number
}

interface Highlight {
  word: string
  color: string
}

interface MultiHighlightTextProps {
  text: string
  highlights: Highlight[]
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#222',
    padding: 20
  },
  createExpenditureButton: {
    backgroundColor: '#1E90FF', // A bright color for the button
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20 // Space from other elements
  },
  createExpenditureButtonText: {
    color: '#fff', // White text color
    fontSize: 16,
    fontWeight: 'bold'
  },
  roomListContainer: {
    flex: 1
  },
  roomContainer: {
    flex: 1
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10
  },
  backButton: {
    fontSize: 24,
    color: '#b0d943'
  },
  roomHeader: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#b0d943',
    flex: 1,
    textAlign: 'center'
  },
  memberCount: {
    fontSize: 12,
    color: '#aaa'
  },
  heading: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#b0d943'
  },
  addButton: {
    backgroundColor: '#b0d943',
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center'
  },
  addButtonText: {
    fontSize: 24,
    color: '#222',
    fontWeight: 'bold'
  },
  roomItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#333',
    padding: 15,
    borderRadius: 10,
    marginVertical: 5
  },
  InbalanceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    backgroundColor: '#333',
    padding: 15,
    borderRadius: 10,
    marginVertical: 5
  },
  InbalanceItemReverse: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    backgroundColor: '#333',
    padding: 15,
    borderRadius: 10,
    marginVertical: 5
  },
  roomEmoji: {
    fontSize: 24,
    marginRight: 10
  },
  roomInfo: {
    flex: 1
  },
  InbalanceText: {
    marginRight: 10,
    marginLeft: 10
  },
  roomName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff'
  },
  roomMembers: {
    fontSize: 14,
    color: '#aaa'
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 10
  },
  input: {
    flex: 1,
    height: 40,
    borderColor: '#444',
    borderWidth: 1,
    marginRight: 10,
    paddingHorizontal: 10,
    color: '#fff',
    backgroundColor: '#333',
    borderRadius: 5
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  modalContainer: {
    backgroundColor: '#222',
    padding: 20,
    borderRadius: 10,
    width: '80%'
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#b0d943',
    textAlign: 'center',
    marginBottom: 10
  },
  closeButton: {
    marginTop: 20,
    backgroundColor: '#b0d943',
    padding: 10,
    borderRadius: 5,
    alignItems: 'center'
  },
  closeButtonText: {
    color: '#222',
    fontSize: 16,
    fontWeight: 'bold'
  },
  participantList: {
    marginTop: 20
  },
  participantItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10
  },
  participantName: {
    fontSize: 16,
    color: '#fff'
  },
  participantAmount: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  amountText: {
    fontSize: 16,
    color: '#fff',
    marginHorizontal: 10
  },
  inputRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15 // Added some space between the inputs and participants list
  },
  modalTitleInput: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 10,
    textAlign: 'center',
    height: 40,
    borderWidth: 1,
    borderColor: '#444',
    backgroundColor: '#333',
    borderRadius: 5,
    paddingLeft: 10
  },

  emojiPicker: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginRight: 10,
    width: '45%' // Width of the emoji picker container
  },

  emoji: {
    fontSize: 30,
    marginRight: 10
  },

  emojiInput: {
    height: 40,
    borderColor: '#444',
    borderWidth: 1,
    color: '#fff',
    backgroundColor: '#333',
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingVertical: 10
  }
})
