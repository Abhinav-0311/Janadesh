# Advanced Voting Platform - Frontend

A modern React application built with TypeScript, Vite, and Material-UI for the Advanced Blockchain Voting Platform.

## Features

- **Modern Tech Stack**: React 18, TypeScript, Vite for fast development
- **State Management**: Redux Toolkit for predictable state management
- **UI Components**: Material-UI (MUI) for professional design
- **Routing**: React Router for client-side navigation
- **Responsive Design**: Mobile-first approach with Material-UI
- **Type Safety**: Full TypeScript support throughout the application

## Project Structure

```
src/
├── components/          # Reusable UI components
│   └── layout/         # Layout components (Header, Footer, etc.)
├── pages/              # Page components
│   ├── Home/           # Landing page
│   ├── Elections/      # Election listing and details
│   ├── Vote/           # Voting interface
│   ├── Results/        # Results display
│   ├── Admin/          # Administrative dashboard
│   └── NotFound/       # 404 page
├── store/              # Redux store and slices
│   └── slices/         # Redux Toolkit slices
├── theme/              # Material-UI theme configuration
├── types/              # TypeScript type definitions
├── services/           # API and external service integrations
├── hooks/              # Custom React hooks
└── utils/              # Utility functions
```

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

1. Navigate to the frontend directory:
   ```bash
   cd frontend-react
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open your browser and visit `http://localhost:3000`

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
VITE_API_BASE_URL=http://localhost:5000/api
VITE_WS_URL=ws://localhost:5000
VITE_BLOCKCHAIN_NETWORK=localhost
```

### Proxy Configuration

The Vite configuration includes a proxy for API calls to the backend server running on port 5000.

## State Management

The application uses Redux Toolkit with the following slices:

- **authSlice**: User authentication and profile management
- **electionsSlice**: Election data and filtering
- **votingSlice**: Voting process and status
- **uiSlice**: UI state (theme, notifications, modals)

## Routing

The application includes the following routes:

- `/` - Home page
- `/elections` - Election listing
- `/elections/:id` - Election details
- `/vote/:id` - Voting interface
- `/results/:id` - Election results
- `/admin` - Admin dashboard
- `*` - 404 Not Found

## Material-UI Theme

The application uses a custom Material-UI theme with:

- Primary color: Blue (#1976d2)
- Secondary color: Pink (#dc004e)
- Custom component styling
- Responsive typography
- Consistent spacing and shadows

## Next Steps

This is the initial setup for the React application. Future tasks will implement:

1. Web3 integration and wallet connection
2. Authentication and user management UI
3. Election management interface
4. Voting interface and experience
5. Results and analytics dashboard
6. Responsive design and accessibility features
7. Comprehensive testing

## Development Guidelines

- Use TypeScript for all new files
- Follow Material-UI design patterns
- Implement responsive design principles
- Use Redux Toolkit for state management
- Write meaningful component and function names
- Add proper error handling and loading states