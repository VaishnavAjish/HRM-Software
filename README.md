# HRFlow Pro

Complete HR Management System built with React, TypeScript, Node.js, Express, and MongoDB.

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Recharts, Zustand
- **Backend:** Node.js, Express, TypeScript, Mongoose, MongoDB
- **Authentication:** JWT + bcryptjs
- **Features:** Employee Management, Attendance, Leave, Payroll, Recruitment, Performance, Training, Reports

## Getting Started

```bash
npm run install:all
npm run dev
```

Client runs on `http://localhost:5173`, Server on `http://localhost:5000`.

## Environment Variables

Copy `server/.env.example` to `server/.env` and fill in your values.

## Project Structure

```
hrflow-pro/
├── client/          # React frontend
│   ├── src/
│   │   ├── api/          # API client
│   │   ├── components/   # Reusable UI components
│   │   ├── contexts/     # React contexts
│   │   ├── hooks/        # Custom hooks
│   │   ├── pages/        # Page components
│   │   ├── store/        # Zustand store
│   │   ├── types/        # TypeScript types
│   │   └── utils/        # Utilities
│   └── ...
├── server/          # Express backend
│   ├── src/
│   │   ├── config/       # DB & env config
│   │   ├── controllers/  # Route controllers
│   │   ├── middleware/   # Express middleware
│   │   ├── models/       # Mongoose models
│   │   ├── routes/       # Route definitions
│   │   ├── services/     # Business logic
│   │   ├── types/        # TypeScript types
│   │   ├── utils/        # Utilities
│   │   └── migrations/   # Initial DB migration
│   └── ...
└── package.json     # Root workspace
```