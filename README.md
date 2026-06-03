# SecSell Backend

Small Node.js/Express backend for shared Sales, Announcements, Inventory and Orders.

## Admin login

Default admin email:

```txt
testest7173@gmail.com
```

Default admin password:

```txt
Passwordisnotowner123idiot
```

For real hosting, change these in `.env`.

## Start locally

```bash
cd secsell_backend
npm install
cp .env.example .env
npm start
```

Open:

```txt
http://localhost:3000
```

## How it works

- Public users load Sales, Announcements and Inventory from `/api/site`.
- Admin logs in through `/api/admin/login`.
- Admin edits packages in the website UI.
- Changes are saved into `data/db.json`.
- New visitors automatically see the same backend data.

## Important

This is a small file-based backend. It is fine for testing and small private use. For a serious public shop, move to a real database such as PostgreSQL, Supabase, Firebase or MongoDB.

Also change `JWT_SECRET` before hosting. Do not keep the default secret online.
