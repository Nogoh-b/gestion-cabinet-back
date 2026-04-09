import { MODE_REIMBURSEMENT_PERIOD } from './types';

export function getCronTime(date: Date, period: MODE_REIMBURSEMENT_PERIOD) {
  let cronTimeFormat: string = '';
  const getMinute = date.getMinutes();
  const getHour = date.getHours();
  const getDay = date.getDay();
  const getDate = date.getDate();
  switch (period) {
    case MODE_REIMBURSEMENT_PERIOD.DAILY_2:
    case MODE_REIMBURSEMENT_PERIOD.DAILY_3:
    case MODE_REIMBURSEMENT_PERIOD.DAILY_4:
    case MODE_REIMBURSEMENT_PERIOD.DAILY_5:
    case MODE_REIMBURSEMENT_PERIOD.DAILY_6:
    case MODE_REIMBURSEMENT_PERIOD.BIWEEKLY:
    case MODE_REIMBURSEMENT_PERIOD.DAILY:
      cronTimeFormat = `0 ${getMinute} ${getHour} * * *`;
      break;
    case MODE_REIMBURSEMENT_PERIOD.WEEKLY:
      cronTimeFormat = `0 ${getMinute} ${getHour} * * ${getDay}`;
      break;
    case MODE_REIMBURSEMENT_PERIOD.MONTHLY:
      cronTimeFormat = `0 ${getMinute} ${getHour} */${getDate} * *`;
      break;
    case MODE_REIMBURSEMENT_PERIOD.QUARTERLY_3:
      cronTimeFormat = `0 ${getMinute} ${getHour} ${getDate} */3 *`;
      break;
    case MODE_REIMBURSEMENT_PERIOD.QUARTERLY_4:
      cronTimeFormat = `0 ${getMinute} ${getHour} ${getDate} */4 *`;
      break;
  }
  return cronTimeFormat;
}
