/** Prints a fresh VAPID key pair for WEB_PUSH_PUBLIC_KEY / WEB_PUSH_PRIVATE_KEY. */
import webpush from "web-push";

const keys = webpush.generateVAPIDKeys();
console.log(`WEB_PUSH_PUBLIC_KEY="${keys.publicKey}"`);
console.log(`WEB_PUSH_PRIVATE_KEY="${keys.privateKey}"`);
console.log(`WEB_PUSH_SUBJECT="mailto:admin@tretu.de"`);
