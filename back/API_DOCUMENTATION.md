# Backend API Documentation

Welcome to the backend API documentation for **EcomAssistant**. This document outlines all available endpoints, their input parameters, verification mechanisms, validation rules, and response formats.

---

## General Information

### Base URL
All API paths listed in this document are relative to the server port configured in the environment variables (defaults to `http://localhost:3000`).
If the request is routed through the main API router, routes are prefixed as follows:
- Auth Endpoints: `/auth` (e.g., `http://localhost:3000/auth/signup`)

### Global Content Type
For all endpoints requesting or returning payload bodies (unless specified otherwise), the content type is:
- `Content-Type: application/json`

### Error Response Schema

The backend handles request schema validation errors via Zod, which outputs a structured payload with error details. Other service-level validation and business logic exceptions are thrown and returned with a message.

#### 1. Zod Validation Error Response (`400 Bad Request`)
Returned when the body, query, or path parameters fail the validation criteria defined in the schemas.
```json
{
  "message": "Validation failed",
  "errors": [
    {
      "field": "email",
      "message": "Invalid email address"
    },
    {
      "field": "password",
      "message": "Password must contain at least one number"
    }
  ]
}
```

#### 2. Business Logic / Client Error Response (`400 Bad Request` or `401 Unauthorized` or `409 Conflict`)
Returned when an operation fails validation, conflict, or permission checks in controllers/services.
```json
{
  "message": "Error message description"
}
```

---

## Route Index

| HTTP Method | Path | Description | Authentication |
| :--- | :--- | :--- | :--- |
| **GET** | [/health](file:///c:/Users/THINKPAD%20T480/Desktop/ecomAssistant/back/src/app.ts#L10) | Service health check | Public |
| **GET** | [/auth/me](file:///c:/Users/THINKPAD%20T480/Desktop/ecomAssistant/back/src/routes/auth.routes.ts#L8) | Get current user profile (currently returns mock data) | Needs clarification / Currently Public |
| **POST** | [/auth/signup](file:///c:/Users/THINKPAD%20T480/Desktop/ecomAssistant/back/src/routes/auth.routes.ts#L9) | Register a new merchant and shop | Public |
| **POST** | [/auth/verify-email](file:///c:/Users/THINKPAD%20T480/Desktop/ecomAssistant/back/src/routes/auth.routes.ts#L10) | Verify email using verification code from Redis | Public |
| **POST** | [/auth/login](file:///c:/Users/THINKPAD%20T480/Desktop/ecomAssistant/back/src/routes/auth.routes.ts#L11) | Log in a verified merchant | Public |

---

## Endpoint Details

### 1. Health Check
Retrieves the uptime and system status of the backend API.

- **HTTP Method**: `GET`
- **Path**: `/health`
- **Authentication**: Public (No authentication required)
- **Headers**: None required

#### Request Parameters
- **URL Params**: None
- **Query Params**: None
- **Body**: None

#### Responses
##### Success (`200 OK`)
Returns the service status and current server timestamp.
- **Response Body Structure**:
  - `status` (string): The status statement.
  - `timestamp` (string): ISO format timestamp of the request.
- **Example Response**:
  ```json
  {
    "status": "ok man",
    "timestamp": "2026-06-16T14:28:44.201Z"
  }
  ```

---

### 2. Get Merchant Profile (Get Me)
Retrieves the logged-in merchant profile details.

- **HTTP Method**: `GET`
- **Path**: `/auth/me`
- **Authentication**: **Needs Clarification** (Currently public. The route has no active authentication middleware and returns hardcoded mock data).
- **Headers**: None required (as implemented currently)

#### Request Parameters
- **URL Params**: None
- **Query Params**: None
- **Body**: None

#### Responses
##### Success (`200 OK`)
Returns the mock merchant profile information.
- **Response Body Structure**:
  - `name` (string): The merchant last name.
  - `firstname` (string): The merchant first name.
- **Example Response**:
  ```json
  {
    "name": "nedjar",
    "firstname": "abdelmoumen"
  }
  ```

---

### 3. Merchant Signup
Registers a brand new merchant and creates a related shop. If the merchant email already exists in the database but is **not** verified, this registration overwrites the previous credentials and sends a new OTP code. If the email is verified, it blocks registration.

- **HTTP Method**: `POST`
- **Path**: `/auth/signup`
- **Authentication**: Public
- **Headers**:
  - `Content-Type: application/json`

#### Request Parameters
- **URL Params**: None
- **Query Params**: None
- **Body Payload** (`application/json`):
  | Field | Type | Required | Description / Validation Rules |
  | :--- | :--- | :--- | :--- |
  | `email` | string | Yes | Must be a valid email format. |
  | `password` | string | Yes | Min 8 characters, must contain at least one number (`[0-9]`). |
  | `shopName` | string | Yes | Min 2 characters, max 64 characters. |

#### Responses
##### Success (`201 Created`)
The account is created or updated. A verification email containing a 6-digit OTP code is sent.
- **Response Body Structure**:
  - `message` (string): Success message indicating verification email has been sent.
- **Example Response**:
  ```json
  {
    "message": "Registration successful. Please check your email for the verification code."
  }
  ```

##### Error: Validation Failed (`400 Bad Request`)
The input body does not match validation rules.
- **Example Response**:
  ```json
  {
    "message": "Validation failed",
    "errors": [
      {
        "field": "password",
        "message": "Password must be at least 8 characters"
      }
    ]
  }
  ```

##### Error: Email Already Registered (`409 Conflict`)
The email address belongs to an already verified merchant.
- **Example Response**:
  ```json
  {
    "message": "Email is already registered"
  }
  ```

---

### 4. Verify Email
Verifies the merchant's email address by providing the 6-digit OTP code received in the verification email. This endpoint retrieves the OTP from Redis, marks the merchant as verified, deletes the OTP from Redis, and returns an access token.

- **HTTP Method**: `POST`
- **Path**: `/auth/verify-email`
- **Authentication**: Public
- **Headers**:
  - `Content-Type: application/json`

#### Request Parameters
- **URL Params**: None
- **Query Params**: None
- **Body Payload** (`application/json`):
  | Field | Type | Required | Description / Validation Rules |
  | :--- | :--- | :--- | :--- |
  | `email` | string | Yes | Must be a valid email format. |
  | `code` | string | Yes | Exactly 6 digits, must contain only numbers. |

#### Responses
##### Success (`200 OK`)
Verification is successful. The merchant profile is marked verified and an access token is returned.
- **Response Body Structure**:
  - `result` (object): Result container.
    - `message` (string): Success description message.
    - `accessToken` (string): Signed JWT accessToken for subsequent authenticated requests.
    - `merchant` (object): Verified merchant profile detail.
      - `id` (string): Unique identifier (CUID) of the merchant.
      - `email` (string): The merchant's verified email.
      - `name` (string): The merchant's name / shop name.
      - `isVerified` (boolean): `true`.
      - `shop` (object): Relational shop details.
        - `id` (string): Unique identifier (CUID) of the shop.
        - `merchantId` (string): The associated merchant's ID.
        - `shopName` (string): The name of the shop.
- **Example Response**:
  ```json
  {
    "result": {
      "message": "Email verified successfully",
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJtZXJjaGFudElkIjoiY2x5Z2k4eXJyMDAwMHNkd3c4NjBrMm16ZSIsImVtYWlsIjoic2hvcEBlbXBlcm9yLmNvbSIsImlhdCI6MTcxODUxNjg2MCwiZXhwIjoxNzE4NjAzMjYwfQ.abcdef...",
      "merchant": {
        "id": "clygi8yrr0000sdww860k2mze",
        "email": "shop@emperor.com",
        "name": "My Emperor Shop",
        "isVerified": true,
        "shop": {
          "id": "clygi8yrs0001sdww990k8zpe",
          "merchantId": "clygi8yrr0000sdww860k2mze",
          "shopName": "My Emperor Shop"
        }
      }
    }
  }
  ```

##### Error: Validation Failed (`400 Bad Request`)
The inputs do not match the validation schema.
- **Example Response**:
  ```json
  {
    "message": "Validation failed",
    "errors": [
      {
        "field": "code",
        "message": "Code must contain only numbers"
      }
    ]
  }
  ```

##### Error: Invalid or Expired Code (`400 Bad Request`)
The OTP code is either incorrect, or expired in Redis storage.
- **Possible Message List**:
  - `"Verification code expired or invalid"`
  - `"Invalid verification code"`
  - `"Merchant not found"`
  - `"Email already verified"`
- **Example Response**:
  ```json
  {
    "message": "Verification code expired or invalid"
  }
  ```

---

### 5. Merchant Login
Logs in an already verified merchant by checking credentials against the stored password hash. Upon success, returns the merchant data and a signed access token.

- **HTTP Method**: `POST`
- **Path**: `/auth/login`
- **Authentication**: Public
- **Headers**:
  - `Content-Type: application/json`

#### Request Parameters
- **URL Params**: None
- **Query Params**: None
- **Body Payload** (`application/json`):
  | Field | Type | Required | Description / Validation Rules |
  | :--- | :--- | :--- | :--- |
  | `email` | string | Yes | Must be a valid email format. |
  | `password` | string | Yes | Plain-text password. |

#### Responses
##### Success (`200 OK`)
Credentials are correct. A JWT token and matching merchant information are returned.
- **Response Body Structure**:
  - `message` (string): `"Login successful"`
  - `accessToken` (string): Signed JWT accessToken for subsequent authenticated requests.
  - `merchant` (object): Authenticated merchant information.
    - `id` (string): Unique identifier (CUID) of the merchant.
    - `email` (string): The merchant email.
    - `shop` (object): Relational shop details.
      - `id` (string): Unique identifier (CUID) of the shop.
      - `merchantId` (string): The associated merchant's ID.
      - `shopName` (string): The name of the shop.
- **Example Response**:
  ```json
  {
    "message": "Login successful",
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJtZXJjaGFudElkIjoiY2x5Z2k4eXJyMDAwMHNkd3c4NjBrMm16ZSIsImVtYWlsIjoic2hvcEBlbXBlcm9yLmNvbSIsImlhdCI6MTcxODUxNjg2MCwiZXhwIjoxNzE4NjAzMjYwfQ.abcdef...",
    "merchant": {
      "id": "clygi8yrr0000sdww860k2mze",
      "email": "shop@emperor.com",
      "shop": {
        "id": "clygi8yrs0001sdww990k8zpe",
        "merchantId": "clygi8yrr0000sdww860k2mze",
        "shopName": "My Emperor Shop"
      }
    }
  }
  ```

##### Error: Validation Failed (`400 Bad Request`)
The inputs do not match the validation schema.
- **Example Response**:
  ```json
  {
    "message": "Validation failed",
    "errors": [
      {
        "field": "email",
        "message": "Invalid email address"
      }
    ]
  }
  ```

##### Error: Invalid Credentials (`401 Unauthorized`)
Login details mismatch or merchant is not verified.
- **Possible Message List**:
  - `"Invalid Email"`
  - `"Email address not yet registered"`
  - `"Password Incorrect"`
- **Example Response**:
  ```json
  {
    "message": "Password Incorrect"
  }
  ```
