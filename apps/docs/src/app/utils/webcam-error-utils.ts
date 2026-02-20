import { WebcamErrorCode } from "webcam-ts";
import { Resolution } from "webcam-ts";

export interface StartErrorInfo {
	title: string;
	message: string;
	detail: string | null;
	updatePermissionState: "denied" | null;
}

export class WebcamErrorUtils {
	static getStartErrorInfo(error: unknown, selectedResolution: Resolution | null): StartErrorInfo {
		const errorCode = this.getErrorCode(error);
		const errorName = this.getErrorName(error);
		const rawMessage = this.getErrorMessage(error);

		if (
			errorCode === WebcamErrorCode.PERMISSION_DENIED ||
			errorName === "NotAllowedError" ||
			errorName === "SecurityError"
		) {
			return {
				title: "ยังไม่ได้รับสิทธิ์เข้าถึงกล้อง",
				message: "โปรดอนุญาตการใช้งานกล้องจากเบราว์เซอร์ก่อนเริ่มใช้งาน",
				detail: rawMessage,
				updatePermissionState: "denied",
			};
		}

		if (errorCode === WebcamErrorCode.DEVICE_NOT_FOUND || errorName === "NotFoundError") {
			return {
				title: "ไม่พบอุปกรณ์กล้อง",
				message: "ไม่พบกล้องที่ใช้งานได้ กรุณาตรวจสอบการเชื่อมต่อหรือเลือกกล้องใหม่",
				detail: rawMessage,
				updatePermissionState: null,
			};
		}

		if (errorCode === WebcamErrorCode.DEVICE_BUSY || errorName === "NotReadableError") {
			return {
				title: "กล้องกำลังถูกใช้งาน",
				message: "กล้องถูกใช้งานโดยแอปอื่นอยู่ กรุณาปิดแอปอื่นแล้วลองใหม่",
				detail: rawMessage,
				updatePermissionState: null,
			};
		}

		if (
			errorCode === WebcamErrorCode.OVERCONSTRAINED ||
			errorCode === WebcamErrorCode.CONSTRAINT_ERROR ||
			errorName === "OverconstrainedError"
		) {
			const resLabel = selectedResolution
				? `${selectedResolution.label} (${selectedResolution.width}x${selectedResolution.height})`
				: "ที่เลือก";
			return {
				title: "ความละเอียดไม่รองรับ",
				message: `กล้องไม่รองรับความละเอียด ${resLabel} ลองลดความละเอียดแล้วเริ่มใหม่`,
				detail: rawMessage,
				updatePermissionState: null,
			};
		}

		if (
			errorCode === WebcamErrorCode.VIDEO_ELEMENT_NOT_SET ||
			errorCode === WebcamErrorCode.INVALID_CONFIG
		) {
			return {
				title: "การตั้งค่าเริ่มกล้องไม่ถูกต้อง",
				message: "เกิดข้อผิดพลาดในการตั้งค่ากล้อง กรุณารีเฟรชหน้าแล้วลองใหม่",
				detail: rawMessage,
				updatePermissionState: null,
			};
		}

		return {
			title: "ไม่สามารถเปิดกล้องได้",
			message: "เกิดข้อผิดพลาดระหว่างเปิดกล้อง กรุณาลองอีกครั้ง",
			detail: rawMessage,
			updatePermissionState: null,
		};
	}

	static getErrorCode(error: unknown): string | null {
		if (typeof error !== "object" || error === null || !("code" in error)) {
			return null;
		}

		const code = (error as { code?: unknown }).code;
		return typeof code === "string" ? code : null;
	}

	static getErrorName(error: unknown): string | null {
		if (error instanceof Error) {
			return error.name;
		}

		if (typeof error === "object" && error !== null && "name" in error) {
			const name = (error as { name?: unknown }).name;
			return typeof name === "string" ? name : null;
		}

		return null;
	}

	static getErrorMessage(error: unknown): string | null {
		if (error instanceof Error) {
			return error.message;
		}

		if (typeof error === "object" && error !== null && "message" in error) {
			const message = (error as { message?: unknown }).message;
			return typeof message === "string" ? message : null;
		}

		return null;
	}
}
