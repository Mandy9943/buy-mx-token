import BigNumber from "bignumber.js";
import { e, envChain, World } from "xsuite";
import data from "./data.json";

require("dotenv").config();

const world = World.new({
  chainId: envChain.id(),
});

const botWallet = () =>
  world.newWalletFromFile_unsafe(
    "bot-wallet.json",
    process.env.WALLET_PASSWORD!
  );

// buy token
const buyToken = async ({
  tokenToPay,
  amountToPay,
  tokenToBuy,
  minAmountToBuy,
  scAddress,
}: {
  amountToPay: number;
  tokenToPay: string;
  tokenToBuy: string;
  minAmountToBuy: number;
  scAddress: string;
}) => {
  const wallet = await botWallet();

  const result = await wallet.callContract({
    callee: scAddress,
    funcName: "swapTokensFixedInput",
    gasLimit: 600_000_000,
    esdts: [
      {
        amount: amountToPay,
        nonce: 0,
        id: tokenToPay,
      },
    ],
    funcArgs: [e.Str(tokenToBuy), e.U(minAmountToBuy)],
  });

  console.log("Transaction:", result.tx.explorerUrl);
};

const wrapEGLD = async (amount: number, shard: 0 | 1 | 2) => {
  const wallet = await botWallet();
  const result = await wallet.callContract({
    callee: envChain.select(data.scByShards)[shard],
    funcName: "wrapEgld",
    gasLimit: 5_000_000,
    value: amount,
  });

  console.log("WrapEGLD Transaction:", result.tx.explorerUrl);
};

const tryAgainOnError = async (func: () => Promise<void>) => {
  try {
    await func();
  } catch (error: any) {
    if (error.message === "fetch failed") {
      console.error(error.message);
      tryAgainOnError(func);
    } else {
      console.log("Error in tryAgainOnError", error.message);
    }
  }
};

const buyTokenWithWEGLD = async (
  amount: number,
  tokenToBuy: string,
  tokenToBuyDecimals: number,
  scAddress: string
) => {
  tryAgainOnError(() =>
    buyToken({
      amountToPay: new BigNumber(amount).times(1e18).toNumber(),
      tokenToPay: "WEGLD-a28c59",
      tokenToBuy: tokenToBuy,
      minAmountToBuy: new BigNumber(1)
        .times(10 ** tokenToBuyDecimals)
        .toNumber(),
      scAddress: scAddress,
    })
  );
};

const fetchTransfersByTokenIdentifier = async (
  tokenIdentifier: string
): Promise<
  {
    txHash: string;
    miniBlockHash: string;
    receiver: string;
    receiverAssets: {
      name: string;
      description: string;
      social: any;
      tags: any;
      iconPng: string;
      iconSvg: string;
    };
    receiverShard: number;
    sender: string;
    senderShard: number;
    status: string;
    value: string;
    timestamp: number;
    data: string;
    function: string;
    action: {
      category: string;
      name: string;
      description: string;
      arguments: any;
    };
    type: string;
    originalTxHash: string;
  }[]
> => {
  try {
    const res = await fetch(
      "https://api.multiversx.com/tokens/" + tokenIdentifier + "/transfers"
    );
    const data = await res.json();

    console.log("Data fetched");

    return data;
  } catch (error) {
    console.log("Failed to fetch", error);
    return [];
  }
};

export const watchTransfersByTokenIdentifier = async (
  tokenIdentifier: string
) => {
  setInterval(async () => {
    const transfers = await fetchTransfersByTokenIdentifier(tokenIdentifier);
    if (transfers.length > 3) {
      buyTokenWithWEGLD(5, "token1123", 18, "");
    }
  }, 10000);
};

// tryAgainOnError(() => wrapEGLD(3e18, 0));
