// generic low level reusuable utils for interacting with exchanges.

const retry = require('retry');
const _ = require('lodash');

const retryInstance = (options, checkFn, callback) => {
  if (!options) {
    options = {
      retries: 30,
      factor: 1.5,
      minTimeout: 1 * 1000,
      maxTimeout: 8 * 1000
    };
  }

  const operation = retry.operation(options);
  operation.attempt(function (currentAttempt) {
    checkFn((err, result) => {
      if (!err) {
        return callback(global.DEFAULT_OK_RESPONSE, result);
      } else {
        if (err.result === global.CUSTOM_OK_RESPONSE.result) {
          return callback(err, result);
        }
      }

      if (currentAttempt > options.retries) {
        return callback(global.DEFAULT_FAIL_RESPONSE);
      }

      if (err.notFatal) {
        if (err.backoffDelay) {
          return setTimeout(() => operation.retry(err), err.backoffDelay);
        }
        let date = new Date()
        console.log(date.toISOString())
        return operation.retry(err);
      }
    });
  });
}

const isValidOrder = ({ api, market, amount, price }) => {
  let reason = false;

  // Check amount
  if (amount < market.minimalOrder.amount) {
    reason = 'Amount is too small';
  }

  // Some exchanges have restrictions on prices
  if (
    _.isFunction(api.isValidPrice) &&
    !api.isValidPrice(price)
  ) {
    reason = 'Price is not valid';
  }

  if (
    _.isFunction(api.isValidLot) &&
    !api.isValidLot(price, amount)
  ) {
    reason = 'Lot size is too small';
  }

  return {
    reason,
    valid: !reason
  }
}

const includes = function (str, list) {
  if (!_.isString(str))
    return false;

  return _.some(list, item => str.includes(item));
}


const getMarketConfig = function (exchangeProperties) {
  return _.find(exchangeProperties.markets, (p) => {
    return _.first(p.pair) === global.MARKET.assetA.toUpperCase() &&
      _.last(p.pair) === global.MARKET.assetB.toUpperCase();
  });
}

module.exports = {
  retry: retryInstance,
  includes: includes,
  isValidOrder,
  getMarketConfig

}
