import { Hop, Chain } from '@hop-protocol/sdk'
import { ethers } from "ethers"
import yesno from 'yesno';
import 'dotenv/config';
import addresses from './addresses.json' assert {type: "json"};
import sleep from './utils.js'

// fixed varibales 
const maxPriorityFeePerGas = ethers.utils.parseUnits("35", "gwei")
const maxFeePerGas = ethers.utils.parseUnits("35", "gwei")
const sourceChain = Chain.Polygon;
const destinationChain = Chain.Arbitrum;
// connect to web3 
const provider = new ethers.providers.JsonRpcProvider('https://polygon-rpc.com')


async function approveTokenSpending(bridge, token, transferAmount) {
    console.log("-----------")

    // approve token speding on the source chain 
    const approvalAddress = await bridge.getSendApprovalAddress(sourceChain)
    let allowance = await token.allowance(approvalAddress)
    if (allowance.lt(transferAmount)) {
        console.log("starting approving token speding on the source chain ")
        const txData = await token.populateApproveTx(approvalAddress, transferAmount)
        const txApprove = await signer.sendTransaction({
            ...txData,
            maxPriorityFeePerGas,
            maxFeePerGas
        });
        console.log(`Approve transaction hash: ${txApprove.hash}`)
        await txApprove.wait()

        // check new allowance 
        allowance = await token.allowance(approvalAddress)
        console.log("new allowance", allowance.toString())

    } else {
        console.log("Token spending already approved.")
    }
}

async function sendToken(bridge, signer, tokenBalance) {
    const ok = await yesno({
        question: `Do you want to send token cross bridge for address ${await signer.getAddress()}?`
    });

    if (ok) {
        // send token across chain 
        const txData = await bridge.populateSendTx(tokenBalance, sourceChain, destinationChain)
        console.log(txData);
        const txSend = await signer.sendTransaction({
            ...txData,
            maxPriorityFeePerGas,
            maxFeePerGas
        });
        console.log(txSend.hash)
        await txSend.wait()
    } else {
        console.log("pass")
    }
}


const onBar = async (privateKey) => {
    let signer = new ethers.Wallet(privateKey, provider)
    let hop = new Hop('mainnet', signer)
    let bridge = hop.connect(signer).bridge('ETH')
    let address = await signer.getAddress()
    console.log("address: ", address)

    // get token object 
    const token = bridge.getCanonicalToken(sourceChain)
    const tokenBalance = await token.balanceOf()
    console.log(`tokenBalance: ${ethers.utils.formatEther(tokenBalance, "gwei")}`)

    if (tokenBalance.gt(0)) {
        // approve token speding on the source chain 
        approveTokenSpending(bridge, token, tokenBalance)

        // send token across chain 
        sendToken(bridge, signer, tokenBalance)

    }

}


const main = async () => {
    for (var index = 0; index < addresses.length; index++) {
        let walletAddress = addresses[index]["address"];
        let privateKey = addresses[index]["private_key"];
        console.log("------------");
        console.log(`Start send cross bridge. walletAddress: ${walletAddress}`);
        onBar(privateKey)
        await sleep(1000); // to let the loop run in sequence 
    }
}

main()

