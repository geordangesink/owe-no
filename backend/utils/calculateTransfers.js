const sodium = require('sodium-native')

function calculateTransfers(room) {
  // Step 1: Calculate the net balance for each member
  const balances = {}

  room.expenditures.forEach((expenditure) => {
    Object.keys(expenditure.participants).forEach((participantId) => {
      const value = getOweByParts(expenditure, participantId)
      if (balances[participantId] === undefined) {
        balances[participantId] = 0
      }
      balances[participantId] += value
    })
  })

  // Step 2: Separate creditors and debtors
  const debtors = []
  const creditors = []
  Object.keys(balances).forEach((personId) => {
    if (balances[personId] < 0) {
      debtors.push({
        personId,
        value: Math.abs(balances[personId])
      })
    } else if (balances[personId] > 0) {
      creditors.push({
        personId,
        value: balances[personId]
      })
    }
  })

  // Step 3: Calculate the most efficient transfers
  const transfers = []
  let debtorIndex = 0
  let creditorIndex = 0

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex]
    const creditor = creditors[creditorIndex]

    const transferAmount = Math.min(debtor.value, creditor.value)
    const id = Buffer.alloc(32)
    sodium.randombytes_buf(id)
    transfers.push({
      id,
      date: Date.now(), // Current time as transaction timestamp
      from: debtor.personId,
      to: creditor.personId,
      value: transferAmount,
      settled: false
    })

    // Update the remaining balances
    debtors[debtorIndex].value -= transferAmount
    creditors[creditorIndex].value -= transferAmount

    // If the debtor is fully paid, move to the next debtor
    if (debtors[debtorIndex].value === 0) {
      debtorIndex++
    }

    // If the creditor is fully paid, move to the next creditor
    if (creditors[creditorIndex].value === 0) {
      creditorIndex++
    }
  }

  // Return the transaction history (formatted as per the desired structure)
  return transfers
}

function isExpenditureCreator(expenditure, myId) {
  return expenditure.creator === myId
}

function getOweByParts(expenditure, myId) {
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

module.exports = { calculateTransfers }
