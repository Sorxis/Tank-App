// Verbindung zum Backend (Supabase). Der Schlüssel hier ist öffentlich
// (publishable key) und darf im Browser stehen.
export const BACKEND_URL = 'https://nlxnhqsnlddhdcwesvuu.supabase.co';
export const BACKEND_KEY = 'sb_publishable_3p7QE8YoWsp0_Uq8blGqYg_sD9GXz5k';
export const VAPID_PUBLIC_KEY = 'BF06oP1bhniGuiuYgEaZegm0LLv5ULDyhHvaoxa0GkGUzFxLwXEQMgvB-WFBrDNIIMppdNAaJumBZMmwrRL3wm4';

// Der gemeinsame Tankerkönig-Schlüssel steht NICHT hier (diese Datei ist
// öffentlich), sondern als Secret im Backend. Die App fragt die Preise mit
// dem Familiencode über die Function tank-prices ab.
