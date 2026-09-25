import { toast as sonnerToast } from "sonner";

export { sonnerToast as toast };

export function toastSuccess(message: string, description?: string) {
  sonnerToast.success(message, description ? { description } : undefined);
}

export function toastError(message: string, description?: string) {
  sonnerToast.error(message, description ? { description } : undefined);
}
