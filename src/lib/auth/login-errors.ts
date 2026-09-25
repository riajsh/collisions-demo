export function formatLoginError(message: string): string {
  if (/invalid login credentials/i.test(message)) {
    return "Email or password is incorrect.";
  }

  return message;
}
