install dependencies

```sh
npm install
```

Generate a bundle

```sh
 npx bare-pack --target ios --target android  --linked --out app/app.bundle.mjs backend/backend.mjs
```

run the app on iOS.

```sh
npm run ios
```

if you get a built error try npm

```sh
npm run ios
```

first

create a new room.
![plot](./blob/images/start_page.png)
![plot](./blob/images/create_room.png)
![plot](./blob/images/create_room_modal.png)

copy the console loged invite.
![plot](./blob/images/copy_invite.png)

paste any join on other node.
![plot](./blob/images/join_room.png)

change username.
![plot](./blob/images/change_username.png)
![plot](./blob/images/change_username_modal.png)

create and edit expenditures and adjust parts (can also edit afterwards).
![plot](./blob/images/create_expenditure.png)

check transfers for settlement.
![plot](./blob/images/show_transactions.png)
![plot](./blob/images/transactions_list.png)

settle debts.
![plot](./blob/images/settle_debt.png)
![plot](./blob/images/settle_debt_modal.png)
![plot](./blob/images/debt_settled.png)

check settlement transfers for whole room.
![plot](./blob/images/show_all.png)

leave room.
![plot](./blob/images/leave_room.png)
![plot](./blob/images/leave_room_modal.png)
