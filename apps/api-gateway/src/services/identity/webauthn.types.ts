export interface WebAuthnRegistrationStartRequest {
  email: string;
  display_name: string;
  device_name: string;
  platform?: string;
}

export interface WebAuthnRegistrationStartResponse {
  challenge: string;
  userId: string;
  rp: {
    name: string;
    id: string;
  };
  user: {
    id: string;
    name: string;
    displayName: string;
  };
  pubKeyCredParams: Array<{
    type: string;
    alg: number;
  }>;
  authenticatorSelection: {
    authenticatorAttachment: string;
    userVerification: string;
  };
  timeout: number;
}

export interface WebAuthnRegistrationFinishRequest {
  userId: string;
  credential_id: string;
  public_key: string;
  sign_count: number;
  challenge: string;
}

export interface WebAuthnAuthenticationStartRequest {
  email: string;
  device_name: string;
  platform?: string;
}

export interface WebAuthnAuthenticationStartResponse {
  challenge: string;
  userId: string;
  allowCredentials: Array<{
    type: string;
    id: string;
    transports?: string[];
  }>;
  timeout: number;
  userVerification: string;
}

export interface WebAuthnAuthenticationFinishRequest {
  userId: string;
  credential_id: string;
  authenticatorData: string;
  clientDataJSON: string;
  signature: string;
  challenge: string;
}
