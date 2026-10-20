export interface User {
  id: number;
  email: string;
  full_name: string;
  role: 'admin' | 'ambassador';
  first_login: boolean;
}

export interface Location {
  id: number;
  name: string;
  description: string;
  is_active: boolean;
  order: number;
}

export interface Event {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  location_text: string;
  locations: Location[];
}

export interface GuestSummary {
  id: number;
  adult_names: string;
  category_name: string;
  category_color: string;
  kids_count: number;
  is_checked_in_today: boolean;
  ticket_number: string;
}

export interface ActivityLog {
  id: number;
  guest_name: string;
  category_name: string;
  verified_by_name: string | null;
  location_name: string | null;
  date: string;
  time: string;
  kids_count: number;
  is_accredited: boolean;
}