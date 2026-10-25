export type AccountDocument = {
  username: string;
  passwordHash: string;
  createdAt: Date;
  isDemo?: boolean;
  role?: "admin";
};

export type NeisSchoolOption = {
  code: string;
  atptCode: string;
  name: string;
  sido: string;
  type: string;
};

export type AccountRequestStatus = "pending" | "approved" | "rejected";

export type AccountRequestDocument = {
  schoolName: string;
  sido: string;
  type: string;
  schoolCode?: string;
  atptCode?: string;
  manual: boolean;
  teacherName: string;
  teacherPhone: string;
  teacherEmail?: string;
  teacherRole?: string;
  note?: string;
  status: AccountRequestStatus;
  accountId?: string;
  processedBy?: string;
  approvedAt?: Date;
  rejectedAt?: Date;
  rejectReason?: string;
  createdAt: Date;
  updatedAt: Date;
};
