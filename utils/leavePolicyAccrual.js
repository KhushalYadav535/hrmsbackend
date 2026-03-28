'use strict';

/** Full entitlement upfront (no periodic accrual job). */
function isNoAccrualFrequency(freq) {
  return freq === 'None' || freq === 'Not Applicable';
}

/** Calendar half-year accrual months (0-indexed): January & July */
const HALF_YEARLY_ACCRUAL_MONTHS = [0, 6];

module.exports = {
  isNoAccrualFrequency,
  HALF_YEARLY_ACCRUAL_MONTHS,
};
