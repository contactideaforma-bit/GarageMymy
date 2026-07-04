// fetch AUTHENTIFIÉ vers nos routes API : joint le jeton Supabase de la
// session courante (Authorization: Bearer …). À utiliser pour TOUTES les
// routes /api/* protégées.

import { supabase } from "./supabaseClient";

export async function fetchAuth(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers = new Headers(init.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
