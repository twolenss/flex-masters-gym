export const membershipDays = type => type === 'Monthly' ? 30 : 15;

export function addMembershipDays(date, membershipType) {
  const expires = new Date(`${date}T12:00:00`);
  expires.setDate(expires.getDate() + membershipDays(membershipType));
  return expires.toISOString().slice(0, 10);
}

export function membershipStatus(expirationDate, date = new Date().toISOString().slice(0, 10)) {
  return expirationDate >= date ? 'Active' : 'Expired';
}

export function currentMembership(member, date) {
  return { ...member, status: membershipStatus(member.expires, date) };
}
