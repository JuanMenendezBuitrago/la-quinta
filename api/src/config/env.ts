import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Falta la variable de entorno ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.API_PORT ?? 4000),
  mongoUri: required("MONGO_URI", "mongodb://localhost:27017/laquinta"),
  redisUrl: required("REDIS_URL", "redis://localhost:6379"),
  jwtSecret: required("JWT_SECRET", "dev-secret-cambiame"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "30d",
  otpTtlSeconds: Number(process.env.OTP_TTL_SECONDS ?? 300),
  otpChannel: (process.env.OTP_CHANNEL ?? "email") as "email" | "sms",
  // Cadena de conexion SMTP completa, p. ej. "smtps://usuario%40gmail.com:contraseña@smtp.gmail.com:465".
  // Si no esta definida, el codigo se imprime en los logs (modo desarrollo) en vez de enviarse.
  smtpUrl: process.env.SMTP_URL || null,
  smtpFrom: process.env.SMTP_FROM ?? '"La Quinta" <no-reply@laquinta.local>',
  // Exportacion de pedidos entregados a Google Sheets. Si falta alguno de los tres primeros
  // valores, la exportacion queda desactivada (el resto de la API funciona igual).
  googleSheets: {
    spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID || null,
    serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || null,
    // En .env la clave suele ir en una sola linea con "\n" literales: se restauran los saltos.
    serviceAccountKey: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n") || null,
    sheetName: process.env.GOOGLE_SHEETS_TAB || "Pedidos", // pedidos entregados
    cancelledSheetName: process.env.GOOGLE_SHEETS_CANCELLED_TAB || "Cancelados",
    timeZone: process.env.GOOGLE_SHEETS_TIMEZONE || "America/Bogota",
  },
};
