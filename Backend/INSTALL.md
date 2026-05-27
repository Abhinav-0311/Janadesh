# Backend Installation Guide

## Manual Installation Steps

Since there are path issues with the automated installation, please follow these manual steps:

### 1. Open a new terminal/command prompt

### 2. Navigate to the Backend directory
```bash
cd "Backend"
```

### 3. Install dependencies
```bash
npm install
```

### 4. Verify installation
```bash
npm run build
```

### 5. Run the development server (after dependencies are installed)
```bash
npm run dev
```

## Expected Dependencies

The following packages should be installed:

### Production Dependencies:
- express
- cors
- helmet
- morgan
- dotenv
- pg
- redis
- bcryptjs
- jsonwebtoken
- joi
- winston
- compression
- rate-limiter-flexible

### Development Dependencies:
- @types/express
- @types/cors
- @types/morgan
- @types/pg
- @types/bcryptjs
- @types/jsonwebtoken
- @types/compression
- @types/node
- typescript
- ts-node-dev
- @typescript-eslint/eslint-plugin
- @typescript-eslint/parser
- eslint
- jest
- @types/jest
- ts-jest
- supertest
- @types/supertest

## Troubleshooting

If you encounter TypeScript errors after installation, they should resolve once all dependencies are installed.

The main issues were:
1. Missing node_modules (resolved by npm install)
2. TypeScript strict mode settings (relaxed in tsconfig.json)
3. Express Request interface extensions (handled with type assertions)