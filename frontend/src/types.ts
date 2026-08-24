export type Role = 'user' | 'admin' | 'tech_support';

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  phone?: string;
  ministry?: string;
  bio?: string;
  avatarColor?: string;
  isActive: boolean;
  totpEnabled?: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthResponse {
  user?: User;
  requiresTotp?: boolean;
  pendingTotp?: boolean;
  [key: string]: unknown;
}

export interface ReportSummary {
  id: string;
  reference: string;
  title: string;
  content?: string;
  category: 'general' | 'sensitive';
  status: string;
  urgency?: string;
  createdAt: string;
  updatedAt: string;
  owner?: Pick<User, 'id' | 'firstName' | 'lastName'>;
}
