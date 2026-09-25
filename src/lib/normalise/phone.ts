/**
 * Decides whether two phone numbers are "the same number" for the purposes
 * of deciding whether a new Eventbrite answer is worth flagging as a
 * possible profile update — not for storage/display formatting.
 *
 * NZ numbers show up interchangeably as +64 21 147 7242, 021 147 7242,
 * 0211477242, etc. Comparing the raw strings treats every one of those as a
 * "changed" number, which was flooding the profile-update review queue with
 * pure formatting noise. Stripping everything except digits, then dropping
 * a leading country code (64) or trunk prefix (0), gets down to the actual
 * subscriber number so formatting differences stop counting as real changes.
 */
export function arePhoneNumbersEquivalent(a: string, b: string): boolean {
  const significant = (value: string): string => {
    const digitsOnly = value.replace(/\D/g, "");
    if (digitsOnly.startsWith("64") && digitsOnly.length > 9) {
      return digitsOnly.slice(2);
    }
    if (digitsOnly.startsWith("0")) {
      return digitsOnly.slice(1);
    }
    return digitsOnly;
  };

  const left = significant(a);
  const right = significant(b);
  return left.length > 0 && left === right;
}
