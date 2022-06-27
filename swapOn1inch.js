import { ethers } from "ethers"
import fetch from 'node-fetch';
import Web3 from 'web3';
import 'dotenv/config';
import addresses from './addresses.json' assert {type: "json"};
// import sleep from './utils.js'


// chain info -- matic
const chainId = 137;
const web3RpcUrl = 'https://rpc-cometh-mainnet.maticvigil.com/v1/0937c004ab133135c86586b55ca212a6c9ecd224';

// set api url and connect to web3 
const broadcastApiUrl = 'https://tx-gateway.1inch.io/v1.1/' + chainId + '/broadcast';
const apiBaseUrl = 'https://api.1inch.io/v4.0/' + chainId;
const web3 = new Web3(web3RpcUrl);


function apiRequestUrl(methodName, queryParams) {
    return apiBaseUrl + methodName + '?' + (new URLSearchParams(queryParams)).toString();
};

async function checkAllowance(tokenAddress, walletAddress) {
    return fetch(apiRequestUrl('/approve/allowance', { tokenAddress, walletAddress }))
        .then(res => res.json())
        .then(res => res.allowance);
};

async function broadCastRawTransaction(rawTransaction) {
    return fetch(broadcastApiUrl, {
        method: 'post',
        body: JSON.stringify({ rawTransaction }),
        headers: { 'Content-Type': 'application/json' }
    })
        .then(res => res.json())
        .then(res => {
            return res.transactionHash;
        });
}

async function signAndSendTransaction(transaction, privateKey) {
    const { rawTransaction } = await web3.eth.accounts.signTransaction(transaction, privateKey);

    return await broadCastRawTransaction(rawTransaction);
}


async function buildTxForApproveTradeWithRouter(walletAddress, tokenAddress, amount) {
    const url = apiRequestUrl(
        '/approve/transaction',
        amount ? { tokenAddress, amount } : { tokenAddress }
    );

    const transaction = await fetch(url).then(res => res.json());

    const gasLimit = await web3.eth.estimateGas({
        ...transaction,
        from: walletAddress
    });

    return {
        ...transaction,
        gas: gasLimit
    };
}

async function buildTxForSwap(swapParams) {
    const url = apiRequestUrl('/swap', swapParams);

    return fetch(url).then(res => res.json()).then(res => res.tx);
}

async function swapOn1inch(walletAddress, privateKey) {

    // swapParams
    const swapParams = {
        fromTokenAddress: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // USDC 6 decimals
        toTokenAddress: '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619', // WETH, 18 decimals
        amount: '399000000', // 400 usdc， depend on the decimals
        fromAddress: walletAddress,
        slippage: 0.5,
        disableEstimate: false,
        allowPartialFill: false,
    };

    // check token allowance 
    let allowance = await checkAllowance(swapParams.fromTokenAddress, walletAddress);
    console.log('Allowance: ', allowance);

    if (allowance === "0") {
        // approve token allowance 
        console.log("Start approving token spending");
        const transactionForSign = await buildTxForApproveTradeWithRouter(walletAddress, swapParams.fromTokenAddress);
        const approveTxHash = await signAndSendTransaction(transactionForSign, privateKey);
        console.log('Approve tx hash: ', approveTxHash);
        allowance = await checkAllowance(swapParams.fromTokenAddress, walletAddress);
    };

    // swap
    if (allowance !== "0") {
        console.log("Spending approved, and start swap!");
        const swapTransaction = await buildTxForSwap(swapParams);
        console.log('Transaction for swap: ', swapTransaction);
        // Send a transaction and get its hash
        const swapTxHash = await signAndSendTransaction(swapTransaction, privateKey);
        console.log('Swap transaction hash: ', swapTxHash);
        const receipt = web3.eth.getTransactionReceipt(swapTxHash);
        console.log('Swaped!');
    };
}


async function main() {
    for (var index = 0; index < addresses.length; index++) {
        let walletAddress = addresses[index]["address"];
        let privateKey = addresses[index]["private_key"];

        console.log("------------");
        console.log(`Start swap. walletAddress: ${walletAddress}`);
        await swapOn1inch(walletAddress, privateKey);
    };
}


main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

