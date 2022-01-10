export const getBondData = (data) => {
  let { simpleYield, yearsTillRepayment, currentCostWithNkd, couponsList } =
    data;
  yearsTillRepayment = yearsTillRepayment.toFixed(2);
  simpleYield = simpleYield.toFixed(3);
  currentCostWithNkd = currentCostWithNkd.toFixed(2);

  const couponsSum = getCouponsSum(couponsList);

  return {
    ...data,
    yearsTillRepayment,
    simpleYield,
    currentCostWithNkd,
    couponsSum,
  };
};

const getCouponsSum = (list) => {
  const today = new Date();

  const futureCoupons = list.filter(({ date }) => new Date(date) >= today);

  const sum = futureCoupons.reduce((acc, { value }) => acc + value, 0);

  return sum;
};
