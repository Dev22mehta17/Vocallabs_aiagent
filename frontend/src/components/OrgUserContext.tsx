'use client';

import React, { createContext, useContext, useState } from 'react';

export interface UserSession {
  user_id: string;
  email: string;
  role: 'owner' | 'editor' | 'viewer';
  org_id: string;
  org_name: string;
}

const DEMO_SESSIONS: UserSession[] = [
  {
    user_id: 'a1111111-1111-1111-1111-111111111111',
    email: 'alice.owner@acme.com',
    role: 'owner',
    org_id: '11111111-1111-1111-1111-111111111111',
    org_name: 'Acme AI Corp (Org A)',
  },
  {
    user_id: 'a2222222-2222-2222-2222-222222222222',
    email: 'bob.editor@acme.com',
    role: 'editor',
    org_id: '11111111-1111-1111-1111-111111111111',
    org_name: 'Acme AI Corp (Org A)',
  },
  {
    user_id: 'a3333333-3333-3333-3333-333333333333',
    email: 'charlie.viewer@acme.com',
    role: 'viewer',
    org_id: '11111111-1111-1111-1111-111111111111',
    org_name: 'Acme AI Corp (Org A)',
  },
  {
    user_id: 'b1111111-1111-1111-1111-111111111111',
    email: 'dave.owner@beta.com',
    role: 'owner',
    org_id: '22222222-2222-2222-2222-222222222222',
    org_name: 'Beta Enterprise (Org B)',
  },
  {
    user_id: 'b2222222-2222-2222-2222-222222222222',
    email: 'eve.viewer@beta.com',
    role: 'viewer',
    org_id: '22222222-2222-2222-2222-222222222222',
    org_name: 'Beta Enterprise (Org B)',
  },
];

interface ContextProps {
  session: UserSession;
  setSession: (s: UserSession) => void;
  demoSessions: UserSession[];
}

const OrgContext = createContext<ContextProps>({
  session: DEMO_SESSIONS[0],
  setSession: () => {},
  demoSessions: DEMO_SESSIONS,
});

export const OrgUserProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<UserSession>(DEMO_SESSIONS[0]);

  return (
    <OrgContext.Provider value={{ session, setSession, demoSessions: DEMO_SESSIONS }}>
      {children}
    </OrgContext.Provider>
  );
};

export const useOrgUser = () => useContext(OrgContext);
