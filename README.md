# 📱 P2P Debt Management App

A **decentralized mobile app** to split expenses, manage debts, and calculate optimal transfers among friends. Built with **Hyperswarm, Hypercore, Corestore, Hyperbee, Autobase, and Blind Pairing** for secure and efficient peer-to-peer (P2P) connections.

---

## 🚀 Features

- 🔗 **P2P connections** with Hyperswarm
- 📦 **Decentralized storage** using Hypercore, Corestore & Hyperbee
- 🔄 **Sync across peers** with Autobase
- 🔑 **Secure blind pairing** for connecting storages
- ⚖️ **Optimized debt settlement** with minimal transactions
- 🏡 **Rooms for shared expenses**
- ✍️ **Editable expenditures & user adjustments**
- 💰 **Track settlements & optimize transfers**

---

## 📥 Installation

Before installing dependencies, make sure `bare` is installed globally:

```sh
npm install -g bare
```

Then, install project dependencies:

```sh
npm install
```

---

## 📦 Build

Generate the app bundle:

```sh
npx bare-pack --target ios --target android --linked --out app/app.bundle.mjs backend/backend.mjs
```

---

## ▶️ Run the App

### On iOS

```sh
npm run ios
```

If you encounter a build error, try:

```sh
npm start
```

Then kill the process and try

```sh
npm run ios
```

---

## 🔄 Usage Guide

### 🎥 Demo Video

<p align="center">
  <a href="https://youtu.be/Sj9Nc_8Zix8" target="_blank">
    <img src="https://img.youtube.com/vi/Sj9Nc_8Zix8/0.jpg" alt="Watch the demo video" width="80%"/>
  </a>
</p>

### 1️⃣ Create a New Room

<p align="center">
  <img src="./blob/images/start_page.png" width="25%"/>
  <img src="./blob/images/create_room.png" width="25%"/>
  <img src="./blob/images/create_room_modal.png" width="25%"/>
</p>

### 2️⃣ Copy the Invite Link

<p align="center">
  <img src="./blob/images/copy_invite.png" width="25%"/>
</p>

### 3️⃣ Join the Room on Another Node

<p align="center">
  <img src="./blob/images/join_room.png" width="25%"/>
</p>

### 4️⃣ Change Your Username

<p align="center">
  <img src="./blob/images/change_username.png" width="25%"/>
  <img src="./blob/images/change_username_modal.png" width="25%"/>
</p>

### 5️⃣ Add & Edit Expenses

<p align="center">
  <img src="./blob/images/create_expenditure.png" width="25%"/>
</p>

### 6️⃣ Check Transfers for Settlement

<p align="center">
  <img src="./blob/images/show_transactions.png" width="25%"/>
  <img src="./blob/images/transactions_list.png" width="25%"/>
</p>

### 7️⃣ Settle Debts

<p align="center">
  <img src="./blob/images/settle_debt.png" width="25%"/>
  <img src="./blob/images/settle_debt_modal.png" width="25%"/>
  <img src="./blob/images/debt_settled.png" width="25%"/>
</p>

### 8️⃣ View All Settlement Transfers

<p align="center">
  <img src="./blob/images/show_all.png" width="25%"/>
</p>

### 9️⃣ Leave the Room

<p align="center">
  <img src="./blob/images/leave_room.png" width="25%"/>
  <img src="./blob/images/leave_room_modal.png" width="25%"/>
</p>

---

## 🛠️ Tech Stack

- **Networking:** Hyperswarm
- **Storage:** Hypercore, Corestore, Hyperbee
- **Data Syncing:** Autobase
- **Security:** Blind Pairing

---

## 🌍 Why Decentralized?

This app removes the need for central servers, giving users:

✅ **Privacy-first debt management**  
✅ **No reliance on third parties**  
✅ **No Downtimes**

---

## 💡 Future Improvements

- 🔐 Settle debts in the App through decentralized transactions
- 📊 Advanced analytics for expense tracking
- 🌐 Web support for desktop users

---

## 📜 License

This project is licensed under the Apache License 2.0. See the [LICENSE](LICENSE) file for details.

---

🚀 **Built for a Hackathon – Join us in revolutionizing decentralized finance!**
