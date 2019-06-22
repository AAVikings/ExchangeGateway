exports.newExchangeAPI = function newExchangeAPI(logger, exchangeName) {

    /*

    This module allows trading bots to connect to the exchange and do trading operations on it.

    */
    const _ = require('lodash')
    const isValidOrder = require('./exchangeUtils').isValidOrder
    const axios = require('axios')
    let MODULE_NAME = "Exchange API";
    let LOG_INFO = true

    let thisObject = {
        initialize: initialize,
        getTicker: getTicker,
        getOpenPositions: getOpenPositions,
        getExecutedTrades: getExecutedTrades,
        putPosition: putPosition,
        movePosition: movePosition,
        getPublicTradeHistory: getPublicTradeHistory,
        getExchangeProperties: getExchangeProperties,
        getMaxDecimalPositions: getMaxDecimalPositions
    };

    let apiClient;

    return thisObject;

    async function initialize(callBackFunction) {
        try {

            logInfo("Initialize -> Entering function.");

            let botExchange, accessToken, keyId, cloneId
            if (exchangeName === undefined) {
                botExchange = 'Poloniex'; // Default Value
            } else {
                botExchange = exchangeName;
            }

            let exchange = botExchange.toLowerCase() + 'Client.js';
            let api = require('./wrappers/' + exchange);

            if (global.CURRENT_EXECUTION_AT === "Node") {
                keyId = process.env.KEY_ID
                cloneId = process.env.CLONE_ID
                accessToken = process.env.ACCESS_TOKEN
            }

            let keyVaultAPI = createKeyVaultAPIClient(accessToken, keyId, cloneId)
            apiClient = api.newAPIClient(keyVaultAPI, logger);

            callBackFunction(global.DEFAULT_OK_RESPONSE);

        } catch (err) {
            logError("initialize -> err = " + err.stack);
            callBackFunction(global.DEFAULT_FAIL_RESPONSE);
        }
    }

    function createKeyVaultAPIClient(accessToken, keyId, cloneId) {
        logInfo("createKeyVaultAPIClient -> Entering function.");

        const keyVaultAPI = {}
        keyVaultAPI.signTransaction = function (transaction, next) {
            axios({
                url: process.env.KEY_VAULT_ENDPOINT || global.GATEWAY_ENDPOINT,
                method: 'post',
                data: {
                    query: `
                    mutation keyVault_SignTransaction($transaction: String!, $keyId: String, $cloneId: String){
                        keyVault_SignTransaction(transaction: $transaction, keyId: $keyId, cloneId: $cloneId){
                            key,
                            signature,
                            date
                        }
                    }
                    `,
                    variables: {
                        transaction: transaction,
                        keyId: keyId,
                        cloneId: cloneId
                    }
                },
                headers: {
                    access_token: accessToken
                }
            }).then(res => {
                if (res.errors) {
                    next(undefined, 'Error from graphql: ' + res.errors);
                } else {
                    let signature = {
                        Key: res.data.data.keyVault_SignTransaction.key,
                        Sign: res.data.data.keyVault_SignTransaction.signature
                    }
                    next(signature)
                }
            }).catch(error => {
                next(undefined, 'Error signing the message on the key vault: ' + error.message);
            });
        }

        logInfo("createKeyVaultAPIClient -> Returning graphql client.");

        return keyVaultAPI;
    }

    /*
     *  Position Object = {
     *           id,        String
     *           type,      String
     *           rate,      Number
     *           amountA,   Number
     *           amountB,   Number
     *           fee,       Number
     *           datetime   Date
     *       };
     */
    function truncDecimals(pFloatValue) {
        let decimals = getMaxDecimalPositions();
        return parseFloat(parseFloat(pFloatValue).toFixed(decimals));
    }

    /*
     * Return number of decimals for the current market
     */
    function getMaxDecimalPositions() {
        return getMarketConfig().maxDecimals;
    }

    /*
     * Return number of decimals for the current market
     */
    function getMarketConfig() {
        return _.find(getExchangeProperties().markets, (p) => {
            return _.first(p.pair) === global.MARKET.assetA.toUpperCase() &&
                _.last(p.pair) === global.MARKET.assetB.toUpperCase();
        });
    }

    /*
     * Return number of decimals for the current market
     */
    function getExchangeProperties() {
        try {

            logInfo("getExchangeProperties -> Entering function.");

            return apiClient.getExchangeProperties();

        } catch (err) {
            logError("getExchangeProperties -> err = " + err.message);
            callBack(global.DEFAULT_FAIL_RESPONSE);
        }
    }

    /*
     * Returns the price for a given pair of assets.
     * The object returned is an array of trades:
     * ticker = {
     *           bid, Number
     *           ask, Number
     *           last Number
     *       };
     */
    function getTicker(pMarket, callBack) {
        try {

            logInfo("getTicker -> Entering function.");

            apiClient.getTicker(pMarket, callBack);

        } catch (err) {
            logError("getTicker -> err = " + err.message);
            callBack(global.DEFAULT_FAIL_RESPONSE);
        }
    }

    /*
     * Returns the open positions ath the exchange for a given market and user account.
     * The object returned is an array of positions
     *
     */
    function getOpenPositions(pMarket, callBack) {
        try {

            logInfo("getOpenPositions -> Entering function.");
            logInfo("getOpenPositions -> pMarket = " + JSON.stringify(pMarket));

            apiClient.getOpenPositions(pMarket, callBack);

        } catch (err) {
            logError("getOpenPositions -> Error = " + err.message);
            callBack(global.DEFAULT_FAIL_RESPONSE);
        }
    }

    /*
     * Returns the trades for a given order number.
     * The object returned is an array of positions
     */
    function getExecutedTrades(pPositionId, callBack) {
        try {

            logInfo("getExecutedTrades -> Entering function.");
            logInfo("getExecutedTrades -> pPositionId = " + pPositionId);

            apiClient.getExecutedTrades(pPositionId, callBack);

        } catch (err) {
            logError("getExecutedTrades -> Error = " + err.message);
            callBack(global.DEFAULT_FAIL_RESPONSE);
        }
    }

    /*
     * Creates a new buy or sell order.
     * The orderNumber is returned. String
     */
    function putPosition(pMarket, pType, pRate, pAmountA, pAmountB, callBack) {
        try {

            logInfo("putPosition -> Entering function.");
            logInfo("putPosition -> pMarket = " + JSON.stringify(pMarket));
            logInfo("putPosition -> pType = " + pType);
            logInfo("putPosition -> pRate = " + truncDecimals(pRate));
            logInfo("putPosition -> pAmountA = " + truncDecimals(pAmountA));
            logInfo("putPosition -> pAmountB = " + truncDecimals(pAmountB));

            let check = isValidOrder({
                market: getMarketConfig(),
                api: apiClient,
                amount: truncDecimals(pAmountB),
                price: truncDecimals(pRate)
            });

            if (check.valid) {
                if (pType === "buy") {
                    apiClient.buy(pMarket.assetA, pMarket.assetB, truncDecimals(pRate), truncDecimals(pAmountB), callBack);
                    return;
                }

                if (pType === "sell") {
                    apiClient.sell(pMarket.assetA, pMarket.assetB, truncDecimals(pRate), truncDecimals(pAmountB), callBack);
                    return;
                }

                logError("putPosition -> pType must be either 'buy' or 'sell'.");
                callBack(global.DEFAULT_FAIL_RESPONSE);

            } else {
                logError("putPosition -> The order is invalid: " + check.reason);
                callBack(global.DEFAULT_FAIL_RESPONSE);
            }

        } catch (err) {
            logError("putPosition -> err = " + err.message);
            callBack(global.DEFAULT_FAIL_RESPONSE);
        }
    }

    /*
     * Move an existing position to the new rate.
     * The new orderNumber is returned.
     */
    function movePosition(pPosition, pNewRate, pNewAmountB, callBack) {
        try {

            logInfo("movePosition -> Entering function.");
            logInfo("movePosition -> pPosition = " + JSON.stringify(pPosition));
            logInfo("movePosition -> pNewRate = " + truncDecimals(pNewRate));

            apiClient.movePosition(pPosition, truncDecimals(pNewRate), truncDecimals(pNewAmountB), callBack);

        } catch (err) {
            logError("movePosition -> err = " + err.message);
            callBack(global.DEFAULT_FAIL_RESPONSE);
        }
    }

    /*
     * Returns all the trade history from the Exchange since startTime to endTime orderd by tradeId.
     * It's possible that the exchange doesn't support this method.
     * The object returned is an array of trades:
     * trade = {
     *           tradeID,       String
     *           globalTradeID, String
     *           type,          String
     *           rate,          Number
     *           amountA,       Number
     *           amountB,       Number
     *           date       Date
     *       };
     */
    function getPublicTradeHistory(assetA, assetB, startTime, endTime, callBack) {
        try {

            logInfo("getTradeHistory -> Entering function.");

            apiClient.getPublicTradeHistory(assetA, assetB, startTime, endTime, callBack);

        } catch (err) {
            logError("getTradeHistory -> err = " + err.message);
            callBack(global.DEFAULT_FAIL_RESPONSE);
        }
    }

    function logInfo(message) {
        if (LOG_INFO === true) { logger.write(MODULE_NAME, '[INFO] ' + message) }
    }

    function logError(message) {
        logger.write(MODULE_NAME, '[ERROR] ' + message)
    }
};
