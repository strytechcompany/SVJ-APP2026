# Sri Vaishnavi Jewellers

Jewellery management application with a Node.js/Express backend and an Expo React Native frontend.

## Project Structure

- `backend/` - Express API, MongoDB models, routes, and controllers.
- `frontend/` - Expo React Native mobile application.

## Backend Setup

```bash
cd backend
npm install
npm run dev
```

Create `backend/.env` locally with the required MongoDB, JWT, email, and configured login user values. Environment files are intentionally ignored by Git.

## Frontend Setup

```bash
cd frontend
npm install
npm start
```

Use the Expo options to run on Android, iOS, or web.

## Notes

- Do not commit `node_modules`, `.env`, Expo cache, or local tool folders.
- Thermal bill printing is handled in `frontend/src/services/PrintService.js`.
# SVJ-APP
