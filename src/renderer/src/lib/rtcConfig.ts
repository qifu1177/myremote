/**
 * ICE-Server-Konfiguration.
 *
 * Für dieses MVP wird bewusst nur ein öffentlicher STUN-Server verwendet.
 * Das reicht aus, um NAT-Typen im gleichen LAN oder mit "einfachem" NAT im
 * offenen Internet zu verbinden. Für zuverlässige Verbindungen über
 * restriktive NATs/Firewalls hinweg (typisches Unternehmensnetz, symmetrisches
 * NAT) wird zusätzlich ein TURN-Server benötigt — siehe README, Abschnitt
 * "Bekannte Einschränkungen".
 */
export const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }],
};
