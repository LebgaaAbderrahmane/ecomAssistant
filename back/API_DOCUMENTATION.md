# Backend API Documentation

Welcome to the backend API documentation for **EcomAssistant**. This document outlines all available endpoints, validation rules, authentication requirements, input parameters, and response structures.

---

## General Information

### Base URL
All API paths listed in this document are relative to the server port configured in the environment variables (defaults to `http://localhost:3000`).
If the request is routed through the main API router, routes are prefixed as follows:
- Auth Endpoints: `/auth` (e.g., `http://localhost:3000/auth/signup`)

### Global Content Type
For all endpoints requesting or returning payload bodies (unless specified otherwise), the content type is:
- `Content-Type: application/json`

---

## Authentication and Security

Several routes are protected and require a Bearer token in the request header.

### Authorization Header Format
For all protected routes, include the JWT token as follows:
```http
Authorization: Bearer <accessToken>
```

### Authentication Errors (`401 Unauthorized`)
If authentication fails, the backend will return a `401 Unauthorized` response with a specific message:

- **Token is missing**:
  ```json
  {
    "message": "Authorization token missing"
  }
  ```
- **Token is expired**:
  ```json
  {
    "message": "Access token expired"
  }
  ```
- **Token is invalid or corrupted**:
  ```json
  {
    "message": "Invalid access token"
  }
  ```
- **Other generic authentication failures**:
  ```json
  {
    "message": "Unauthorized"
  }
  ```

---

## Error Response Schema

### Zod Validation Error Response (`400 Bad Request`)
Returned when schema validation fails for the query, path, or body parameters:
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
      "message": "Password must be at least 8 characters"
    }
  ]
}
```

### Business Logic Error Response
Returned when database or logic constraints are violated (e.g., invalid passwords, email conflict, expired codes). The status code is typically `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`, or `409 Conflict`.
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
| **GET** | [/auth/me](file:///c:/Users/THINKPAD%20T480/Desktop/ecomAssistant/back/src/routes/auth.routes.ts#L16) | Retrieve authenticated merchant profile (returns mock data) | Protected (Bearer Token) |
| **POST** | [/auth/signup](file:///c:/Users/THINKPAD%20T480/Desktop/ecomAssistant/back/src/routes/auth.routes.ts#L17) | Register a new merchant and shop | Public |
| **POST** | [/auth/verify-email](file:///c:/Users/THINKPAD%20T480/Desktop/ecomAssistant/back/src/routes/auth.routes.ts#L18) | Verify merchant email using verification OTP from Redis | Public |
| **POST** | [/auth/login](file:///c:/Users/THINKPAD%20T480/Desktop/ecomAssistant/back/src/routes/auth.routes.ts#L19) | Login merchant and return access & refresh tokens | Public |
| **POST** | [/auth/refresh](file:///c:/Users/THINKPAD%20T480/Desktop/ecomAssistant/back/src/routes/auth.routes.ts#L20) | Rotate expired access token using a valid refresh token | Public |
| **POST** | [/auth/forgot-password](file:///c:/Users/THINKPAD%20T480/Desktop/ecomAssistant/back/src/routes/auth.routes.ts#L21) | Request a password reset verification code | Public |
| **POST** | [/auth/reset-password](file:///c:/Users/THINKPAD%20T480/Desktop/ecomAssistant/back/src/routes/auth.routes.ts#L22) | Reset password using email, reset OTP, and new password | Public |
| **POST** | [/auth/logout](file:///c:/Users/THINKPAD%20T480/Desktop/ecomAssistant/back/src/routes/auth.routes.ts#L23) | Revoke a single refresh token | Protected (Bearer Token) |
| **POST** | [/auth/logout-all](file:///c:/Users/THINKPAD%20T480/Desktop/ecomAssistant/back/src/routes/auth.routes.ts#L24) | Revoke all active refresh tokens for the merchant | Protected (Bearer Token) |

---

## Endpoint Details

### 1. Health Check
Retrieves system status and server time.

- **HTTP Method**: `GET`
- **Path**: `/health`
- **Authentication**: Public
- **Headers**: None

#### Request Parameters
- **URL Params**: None
- **Query Params**: None
- **Body**: None

#### Responses
##### Success (`200 OK`)
- **Response Body Structure**:
  - `status` (string): The status of the server.
  - `timestamp` (string): ISO timestamp.
- **Example Response**:
  ```json
  {
    "status": "ok man",
    "timestamp": "2026-06-17T14:30:00.000Z"
  }
  ```

---

### 2. Get Merchant Profile (Get Me)
Retrieves profile data of the currently logged-in merchant.

- **HTTP Method**: `GET`
- **Path**: `/auth/me`
- **Authentication**: Protected (Requires `Authorization: Bearer <accessToken>`)
- **Headers**:
  - `Authorization: Bearer <accessToken>`

#### Request Parameters
- **URL / Query / Body**: None

#### Responses
##### Success (`200 OK`)
Returns the mock profile details.
- **Response Body Structure**:
  - `name` (string): Merchant's last name.
  - `firstname` (string): Merchant's first name.
- **Example Response**:
  ```json
  {
    "name": "nedjar",
    "firstname": "abdelmoumen"
  }
  ```

##### Error (`401 Unauthorized`)
- **Example Response**:
  ```json
  {
    "message": "Access token expired"
  }
  ```

---

### 3. Merchant Signup
Registers a merchant and shop. If the email is registered but not verified, this registration overwrites the previous credentials and resets verification.

- **HTTP Method**: `POST`
- **Path**: `/auth/signup`
- **Authentication**: Public
- **Headers**:
  - `Content-Type: application/json`

#### Request Parameters
- **Body Payload** (`application/json`):
  | Field | Type | Required | Description / Validation Rules |
  | :--- | :--- | :--- | :--- |
  | `email` | string | Yes | Must be a valid email format. |
  | `password` | string | Yes | Min 8 characters, must contain at least one number (`[0-9]`). |
  | `shopName` | string | Yes | Min 2 characters, max 64 characters. |

#### Responses
##### Success (`201 Created`)
- **Response Body Structure**:
  - `message` (string): Prompt to check email.
- **Example Response**:
  ```json
  {
    "message": "Registration successful. Please check your email for the verification code."
  }
  ```

##### Error: Email Conflict (`409 Conflict`)
- **Example Response**:
  ```json
  {
    "message": "Email is already registered"
  }
  ```

---

### 4. Verify Email
Verifies email via the 6-digit OTP code sent to the merchant's email.

- **HTTP Method**: `POST`
- **Path**: `/auth/verify-email`
- **Authentication**: Public
- **Headers**:
  - `Content-Type: application/json`

#### Request Parameters
- **Body Payload** (`application/json`):
  | Field | Type | Required | Description / Validation Rules |
  | :--- | :--- | :--- | :--- |
  | `email` | string | Yes | Must be a valid email format. |
  | `code` | string | Yes | Exactly 6 digits, must contain only numbers. |

#### Responses
##### Success (`200 OK`)
- **Response Body Structure**:
  - `message` (string): Success verification message.
  - `accessToken` (string): Generated Access Token.
  - `refreshToken` (string): Generated Refresh Token.
  - `merchant` (object): Merchant entity.
    - `id` (string): Merchant's CUID.
    - `email` (string): Merchant's email.
    - `name` (string): Merchant's shop name.
    - `isVerified` (boolean): `true`.
    - `shop` (object): Associated shop details.
- **Example Response**:
  ```json
  {
    "message": "Email verified successfully",
    "accessToken": "eyJhbGciOiJIUzI1Ni...",
    "refreshToken": "70bc8db1-cc72-4d2c-8cb4-05d6880894fe",
    "merchant": {
      "id": "clygi8yrr0000sdww860k2mze",
      "email": "shop@emperor.com",
      "name": "My Shop",
      "isVerified": true,
      "shop": {
        "id": "clygi8yrs0001sdww990k8zpe",
        "merchantId": "clygi8yrr0000sdww860k2mze",
        "shopName": "My Shop"
      }
    }
  }
  ```

##### Error: Code Expired or Invalid (`400 Bad Request`)
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
Authenticates merchant credentials and issues fresh access & refresh tokens.

- **HTTP Method**: `POST`
- **Path**: `/auth/login`
- **Authentication**: Public
- **Headers**:
  - `Content-Type: application/json`

#### Request Parameters
- **Body Payload** (`application/json`):
  | Field | Type | Required | Description / Validation Rules |
  | :--- | :--- | :--- | :--- |
  | `email` | string | Yes | Must be a valid email format. |
  | `password` | string | Yes | Min 8 characters, must contain at least one number. |

#### Responses
##### Success (`200 OK`)
- **Response Body Structure**:
  - `message` (string): `"Login successful"`
  - `accessToken` (string): Generated JWT Access Token.
  - `refreshToken` (string): Generated UUID Refresh Token.
  - `merchant` (object): Relational merchant info.
- **Example Response**:
  ```json
  {
    "message": "Login successful",
    "accessToken": "eyJhbGciOiJIUzI1Ni...",
    "refreshToken": "6b26fb51-37d4-4bbd-ae84-60145c20c02c",
    "merchant": {
      "id": "clygi8yrr0000sdww860k2mze",
      "email": "shop@emperor.com",
      "shop": {
        "id": "clygi8yrs0001sdww990k8zpe",
        "merchantId": "clygi8yrr0000sdww860k2mze",
        "shopName": "My Shop"
      }
    }
  }
  ```

##### Error: Unauthorized (`401 Unauthorized`)
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

---

### 6. Refresh Token
Exchanges a valid refresh token for a fresh access token and rotates the refresh token (deletes the old refresh token and issues a new one).

- **HTTP Method**: `POST`
- **Path**: `/auth/refresh`
- **Authentication**: Public
- **Headers**:
  - `Content-Type: application/json`

#### Request Parameters
- **Body Payload** (`application/json`):
  | Field | Type | Required | Description / Validation Rules |
  | :--- | :--- | :--- | :--- |
  | `merchantId` | string | Yes | Must be a valid CUID string. |
  | `refreshToken` | string | Yes | Must be a valid UUID string. |

#### Responses
##### Success (`200 OK`)
- **Response Body Structure**:
  - `accessToken` (string): New JWT Access Token.
  - `refreshToken` (string): New rotated UUID Refresh Token.
- **Example Response**:
  ```json
  {
    "accessToken": "eyJhbGciOiJIUzI1Ni...",
    "refreshToken": "fb2d87ee-6997-4ca2-8db8-cb48b26090e9"
  }
  ```

##### Error: Token Expired or Invalid (`401 Unauthorized`)
- **Example Response**:
  ```json
  {
    "message": "Refresh token expired or invalid"
  }
  ```

##### Error: Account Issues (`403 Forbidden`)
- **Example Response**:
  ```json
  {
    "message": "Merchant not found or account unverified"
  }
  ```

---

### 7. Forgot Password
Requests a password reset code. Sends a 6-digit OTP code to the merchant email.

- **HTTP Method**: `POST`
- **Path**: `/auth/forgot-password`
- **Authentication**: Public
- **Headers**:
  - `Content-Type: application/json`

#### Request Parameters
- **Body Payload** (`application/json`):
  | Field | Type | Required | Description / Validation Rules |
  | :--- | :--- | :--- | :--- |
  | `email` | string | Yes | Must be a valid email format. |

#### Responses
##### Success (`200 OK`)
- **Response Body Structure**:
  - `message` (string): Confirmation message.
- **Example Response**:
  ```json
  {
    "message": "Password reset code sent successfully"
  }
  ```

##### Error: Account Not Found (`404 Not Found`)
- **Example Response**:
  ```json
  {
    "message": "Merchant not found or email not verified"
  }
  ```

---

### 8. Reset Password
Resets the password with the 6-digit OTP code and sets the new password.

- **HTTP Method**: `POST`
- **Path**: `/auth/reset-password`
- **Authentication**: Public
- **Headers**:
  - `Content-Type: application/json`

#### Request Parameters
- **Body Payload** (`application/json`):
  | Field | Type | Required | Description / Validation Rules |
  | :--- | :--- | :--- | :--- |
  | `email` | string | Yes | Must be a valid email format. |
  | `code` | string | Yes | Exactly 6 digits, must contain only numbers. |
  | `newPassword` | string | Yes | Min 8 characters, must contain at least one number. |

#### Responses
##### Success (`200 OK`)
- **Response Body Structure**:
  - `message` (string): Confirmation message.
- **Example Response**:
  ```json
  {
    "message": "Password updated successfully. You can now log in."
  }
  ```

##### Error: Invalid or Expired Reset Code (`400 Bad Request`)
- **Possible Message List**:
  - `"Reset code expired or invalid"`
  - `"Invalid reset code"`
- **Example Response**:
  ```json
  {
    "message": "Invalid reset code"
  }
  ```

---

### 9. Logout
Revokes a specific refresh token.

- **HTTP Method**: `POST`
- **Path**: `/auth/logout`
- **Authentication**: Protected (Requires `Authorization: Bearer <accessToken>`)
- **Headers**:
  - `Authorization: Bearer <accessToken>`
  - `Content-Type: application/json`

#### Request Parameters
- **Body Payload** (`application/json`):
  | Field | Type | Required | Description / Validation Rules |
  | :--- | :--- | :--- | :--- |
  | `refreshToken` | string | Yes | The UUID refresh token to revoke. |

#### Responses
##### Success (`200 OK`)
- **Response Body Structure**:
  - `message` (string): Confirmation message.
- **Example Response**:
  ```json
  {
    "message": "Logged out successfully"
  }
  ```

---

### 10. Logout All Devices
Revokes all refresh tokens registered to the authenticated merchant.

- **HTTP Method**: `POST`
- **Path**: `/auth/logout-all`
- **Authentication**: Protected (Requires `Authorization: Bearer <accessToken>`)
- **Headers**:
  - `Authorization: Bearer <accessToken>`

#### Request Parameters
- **Body Payload**: None

#### Responses
##### Success (`200 OK`)
- **Response Body Structure**:
  - `message` (string): Confirmation message.
- **Example Response**:
  ```json
  {
    "message": "Logged out from all devices"
  }
  ```
