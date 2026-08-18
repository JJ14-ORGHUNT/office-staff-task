# Office Staff Task Management

A web application for managing office staff and tasks.

## Features

- View staff members and their positions
- REST API for staff management
- Clean, responsive user interface
- Built with Node.js and Express

## Installation

1. Clone the repository:
```bash
git clone https://github.com/JJ14-ORGHUNT/office-staff-task.git
cd office-staff-task
```

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
npm start
```

The application will be available at `http://localhost:3000`

## Routes

- **GET** `/` - API health check
- **GET** `/staff` - Get all staff members
- **POST** `/staff` - Add a new staff member

## Project Structure

```
office-staff-task/
├── server.js          # Main Express server
├── public/
│   └── index.html     # Frontend UI
├── package.json       # Project dependencies
└── README.md          # This file
```

## Technologies Used

- Node.js
- Express.js
- CORS
- Vanilla JavaScript (Frontend)

## License

MIT
