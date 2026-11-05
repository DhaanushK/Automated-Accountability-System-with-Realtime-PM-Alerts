# Automated Accountability System

A full stack web application for tracking support team metrics, managing team communication, and monitoring accountability. Team members, team leads, and project managers use role-specific dashboards and workflows backed by a Node.js API and MongoDB.

## Features

- Role-oriented experiences for team members, team leads, and project managers.
- Metrics submission and performance dashboards with charts and analysis views.
- Google Sheets integration for viewing and working with spreadsheet-backed metrics.
- Email dashboards and mailbox workflows for team members, team leads, and project managers.
- Calendar integration and shared calendar views.
- Ticket management and reporting endpoints.
- Automated alerts, alert records, and alert tracking.
- Activity logs, data export, and user management.

## Screenshots

### Login

![Login page](Screenshots%20of%20UI/Login%20Page.png)

### Project manager

| Dashboard | Performance analysis |
| --- | --- |
| ![Project manager dashboard](Screenshots%20of%20UI/PM%20Dashboard.png) | ![Project manager performance analysis](Screenshots%20of%20UI/PM%20Performance%20Analysis.png) |

| Email dashboard | Alert system |
| --- | --- |
| ![Project manager email dashboard](Screenshots%20of%20UI/PM%20Email%20Dashboard.png) | ![Project manager alert system](Screenshots%20of%20UI/PM%20Alert%20System.png) |

![Project manager alert records](Screenshots%20of%20UI/PM%20Alert%20Records.png)

### Team lead

| Dashboard | Email dashboard |
| --- | --- |
| ![Team lead dashboard](Screenshots%20of%20UI/TL%20Dashboard.png) | ![Team lead email dashboard](Screenshots%20of%20UI/TL%20Email%20Dashboard.png) |

### Team member

| Dashboard | Performance analysis |
| --- | --- |
| ![Team member dashboard](Screenshots%20of%20UI/TM%20Dashboard.png) | ![Team member performance analysis](Screenshots%20of%20UI/TM%20Performance%20Analysis.png) |

![Team member email system](Screenshots%20of%20UI/TM%20Email%20System.png)

## Technology stack

### Frontend

- React 19 and React Router 7
- Vite 7
- Axios for API requests
- Recharts for charts
- jsPDF and jsPDF AutoTable for PDF reporting

### Backend

- Node.js with ES modules
- Express 4
- MongoDB with Mongoose
- JWT authentication and bcryptjs password hashing
- Google APIs and Google Auth Library
- Nodemailer and IMAP libraries for email features
- ExcelJS and XLSX for spreadsheet and export workflows
- node-cron for scheduled alerts

## Repository layout

```text
.
├── finalyear-backend/       # Express API, MongoDB models, routes, services, schedulers
├── finalyear-frontend/      # React and Vite client
├── Screenshots of UI/       # Screenshots embedded in this README
├── *.md                    # Setup, integration, feature, and implementation guides
└── package.json            # Root-level scripts and dependencies
```

The backend is implemented in Node.js/Express; it is not a Spring Boot service. The `finalyear-frontend/README.md` is the default Vite template; this root README describes the application as implemented in this repository.

## Prerequisites

- Node.js and npm
- MongoDB connection
- Google API credentials for the Google Sheets, Google OAuth, and calendar features you intend to use
- Email credentials for the email features you intend to use

## Setup

### 1. Configure environment

Create or update the backend environment file using `finalyear-backend/.env.example` as a reference. Configure the MongoDB connection, authentication secrets, Google integrations, and email settings required by your deployment. Configure the frontend API URL using `finalyear-frontend/.env.example` as needed.

Keep real secrets and OAuth tokens out of source control. Never copy credential values into documentation or commit them.

### 2. Install dependencies

```bash
cd finalyear-backend
npm install

cd ../finalyear-frontend
npm install
```

### 3. Run the backend

```bash
cd finalyear-backend
npm run dev
```

The backend defaults to port `5001` (or the `PORT` environment variable). Its root endpoint returns a simple API health message. The server connects to MongoDB and initializes the alert scheduler at startup.

### 4. Run the frontend

In a second terminal:

```bash
cd finalyear-frontend
npm run dev
```

Vite prints the local development URL when it starts. For production, build the client with `npm run build` from `finalyear-frontend` and deploy the generated `dist` directory with your chosen static hosting service.

## API areas

The API is mounted under `/api` and includes routes for authentication, Google authorization, metrics, logs, sheets, role-specific email workflows, users, mailbox, calendar, tickets, and alerts. See `finalyear-backend/src/server.js` and the route modules in `finalyear-backend/src/routes/` for the current endpoints and behavior.

## Project documentation

The repository includes focused guides for environment setup, dashboard calculations, calendar integration, email management, alerts, and team management. Start with `ENVIRONMENT_SETUP.md` and the relevant feature guide for the integration you are configuring.

## Notes

- Feature availability depends on valid MongoDB, Google, and email configuration.
- The repository includes integration and diagnostic scripts under `finalyear-backend/`; inspect scripts before running them because some may read or modify configured services or data.
- `TESTING_GUIDE.md` is currently empty. The package scripts expose a frontend lint and production build; the backend package currently exposes `start` and `dev` scripts.
