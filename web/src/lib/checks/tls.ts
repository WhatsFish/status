import tls from "tls";
import type { CheckFn } from "../runner";

const HOST = process.env.PUBLIC_HOST ?? "ai-native.japaneast.cloudapp.azure.com";

/** Days remaining on the cert returned by an HTTPS handshake to PUBLIC_HOST. */
export const tlsExpiry: CheckFn = () =>
  new Promise((resolve) => {
    const socket = tls.connect(
      { host: HOST, port: 443, servername: HOST, rejectUnauthorized: false },
      () => {
        const cert = socket.getPeerCertificate();
        socket.end();
        if (!cert || !cert.valid_to) {
          resolve({
            id: "tls",
            group: "tls",
            name: "Certificate",
            status: "fail",
            detail: "no peer certificate returned",
          });
          return;
        }
        const expiresAt = new Date(cert.valid_to);
        const days = Math.floor((expiresAt.getTime() - Date.now()) / 86_400_000);
        resolve({
          id: "tls",
          group: "tls",
          name: `Certificate (${HOST})`,
          status: days < 3 ? "fail" : days < 14 ? "warn" : "ok",
          detail: `${days} days until ${expiresAt.toISOString().slice(0, 10)}; CN=${cert.subject?.CN ?? "?"}`,
        });
      },
    );
    socket.on("error", (e) => {
      resolve({
        id: "tls",
        group: "tls",
        name: `Certificate (${HOST})`,
        status: "fail",
        detail: e.message,
      });
    });
  });
