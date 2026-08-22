export const appointmentSerialNumber = (rowIndex: number, page: number, pageSize: number) =>
  (page - 1) * pageSize + rowIndex + 1;