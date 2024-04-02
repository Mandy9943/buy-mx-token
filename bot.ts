import BigNumber from "bignumber.js";
import TelegramBot from "node-telegram-bot-api";
import { e, envChain, World } from "xsuite";
import data from "./data.json";
require("dotenv").config();

export const bot = new TelegramBot(process.env.TELEGRAM_BOT!, {
  polling: true,
});

interface Pair {
  address: string;
  firstToken: {
    balance: null;
    decimals: number;
    name: string;
    identifier: string;
    ticker: string;
    owner: string;
    assets: {
      website: string;
      description: string;
      status: string;
      pngUrl: string;
      svgUrl: string;
      __typename: string;
    };
    price: string;
    type: string;
    __typename: string;
  };
  firstTokenPrice: string;
  firstTokenPriceUSD: string;
  firstTokenVolume24h: string;
  firstTokenLockedValueUSD: string;
  secondToken: {
    balance: null | string;
    decimals: number;
    name: string;
    identifier: string;
    ticker: string;
    owner: string;
    assets: {
      website: string;
      description: string;
      status: string;
      pngUrl: string;
      svgUrl: string;
      __typename: string;
    };
    price: string;
    type: string;
    __typename: string;
  };
  secondTokenPrice: string;
  secondTokenPriceUSD: string;
  secondTokenVolume24h: string;
  secondTokenLockedValueUSD: string;
  initialLiquidityAdder: string;
  liquidityPoolToken: {
    balance: null;
    decimals: number;
    name: string;
    identifier: string;
    ticker: string;
    owner: string;
    assets: {
      website: null | string;
      description: null | string;
      status: null | string;
      pngUrl: null | string;
      svgUrl: null | string;
      __typename: string;
    };
    price: string;
    type: string;
    __typename: string;
  };
  state: string;
  type: string;
  lockedValueUSD: string;
  info: {
    reserves0: string;
    reserves1: string;
    totalSupply: string;
    __typename: string;
  };
  feesAPR: string;
  feesUSD24h: string;
  volumeUSD24h: string;
  totalFeePercent: number;
  specialFeePercent: number;
  lockedTokensInfo: null;
  feesCollector: null;
  feeDestinations: any[];
  trustedSwapPairs: any[];
  whitelistedManagedAddresses: any[];
  __typename: string;
}

const amountToBuy = 0.96;
const poolAddress =
  "erd1qqqqqqqqqqqqqpgql8k7m0c5qegcp4lvknfawr8cchpgpksh2jps6cdnsm";

const tokenToSend = "WEGLD-bd4d79";

const world = World.new({
  chainId: envChain.id(),
});

const botWallet = () =>
  world.newWalletFromFile_unsafe(
    "bot-wallet.json",
    process.env.WALLET_PASSWORD!
  );

const tryAgainOnError = async (func: () => Promise<any>) => {
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
    gasLimit: 20_000_000,
    esdts: [
      {
        amount: amountToPay,
        nonce: 0,
        id: tokenToPay,
      },
    ],
    funcArgs: [e.Str(tokenToBuy), e.U(minAmountToBuy)],
  });

  return result.tx;
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

const buyTokenWithWEGLD = async (
  amount: number,
  tokenToBuy: string,
  tokenToBuyDecimals: number,
  scAddress: string
) => {
  tryAgainOnError(() =>
    buyToken({
      amountToPay: new BigNumber(amount).times(1e18).toNumber(),
      tokenToPay: tokenToSend,
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

const fetchPoolInfo = async (
  addressPool: string
): Promise<Pair | undefined> => {
  const response = await fetch("https://graph.xexchange.com/graphql", {
    method: "post",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },

    //make sure to serialize your JSON body
    body: JSON.stringify({
      operationName: "activePoolsDataQuery",
      variables: {
        offset: 0,
        limit: 500,
      },
      query:
        "query activePoolsDataQuery($offset: Int!, $limit: Int!) {\n  pairs(offset: $offset, limit: $limit) {\n    address\n    firstToken {\n      balance\n      decimals\n      name\n      identifier\n      ticker\n      owner\n      assets {\n        website\n        description\n        status\n        pngUrl\n        svgUrl\n        __typename\n      }\n      price\n      type\n      __typename\n    }\n    firstTokenPrice\n    firstTokenPriceUSD\n    firstTokenVolume24h\n    firstTokenLockedValueUSD\n    secondToken {\n      balance\n      decimals\n      name\n      identifier\n      ticker\n      owner\n      assets {\n        website\n        description\n        status\n        pngUrl\n        svgUrl\n        __typename\n      }\n      price\n      type\n      __typename\n    }\n    secondTokenPrice\n    secondTokenPriceUSD\n    secondTokenVolume24h\n    secondTokenLockedValueUSD\n    initialLiquidityAdder\n    liquidityPoolToken {\n      balance\n      decimals\n      name\n      identifier\n      ticker\n      owner\n      assets {\n        website\n        description\n        status\n        pngUrl\n        svgUrl\n        __typename\n      }\n      price\n      type\n      __typename\n    }\n    state\n    type\n    lockedValueUSD\n    info {\n      reserves0\n      reserves1\n      totalSupply\n      __typename\n    }\n    feesAPR\n    feesUSD24h\n    volumeUSD24h\n    totalFeePercent\n    specialFeePercent\n    lockedTokensInfo {\n      lockingSC {\n        address\n        lockedToken {\n          assets {\n            website\n            description\n            status\n            pngUrl\n            svgUrl\n            __typename\n          }\n          decimals\n          name\n          collection\n          ticker\n          __typename\n        }\n        lpProxyToken {\n          assets {\n            website\n            description\n            status\n            pngUrl\n            svgUrl\n            __typename\n          }\n          decimals\n          name\n          collection\n          ticker\n          __typename\n        }\n        farmProxyToken {\n          assets {\n            website\n            description\n            status\n            pngUrl\n            svgUrl\n            __typename\n          }\n          decimals\n          name\n          collection\n          ticker\n          __typename\n        }\n        intermediatedPairs\n        intermediatedFarms\n        __typename\n      }\n      unlockEpoch\n      __typename\n    }\n    feesCollector {\n      address\n      __typename\n    }\n    feeDestinations {\n      address\n      tokenID\n      __typename\n    }\n    trustedSwapPairs\n    whitelistedManagedAddresses\n    __typename\n  }\n  lkmexProxies: proxy {\n    address\n    wrappedLpToken {\n      assets {\n        website\n        description\n        status\n        pngUrl\n        svgUrl\n        __typename\n      }\n      decimals\n      name\n      collection\n      ticker\n      __typename\n    }\n    wrappedFarmToken {\n      assets {\n        website\n        description\n        status\n        pngUrl\n        svgUrl\n        __typename\n      }\n      decimals\n      name\n      collection\n      ticker\n      __typename\n    }\n    lockedAssetTokens {\n      assets {\n        website\n        description\n        status\n        pngUrl\n        svgUrl\n        __typename\n      }\n      decimals\n      name\n      collection\n      ticker\n      __typename\n    }\n    assetToken {\n      balance\n      decimals\n      name\n      identifier\n      ticker\n      owner\n      assets {\n        website\n        description\n        status\n        pngUrl\n        svgUrl\n        __typename\n      }\n      price\n      type\n      __typename\n    }\n    intermediatedPairs\n    intermediatedFarms\n    __typename\n  }\n  simpleLockProxies: simpleLock {\n    address\n    lockedToken {\n      assets {\n        website\n        description\n        status\n        pngUrl\n        svgUrl\n        __typename\n      }\n      decimals\n      name\n      collection\n      ticker\n      __typename\n    }\n    lpProxyToken {\n      assets {\n        website\n        description\n        status\n        pngUrl\n        svgUrl\n        __typename\n      }\n      decimals\n      name\n      collection\n      ticker\n      __typename\n    }\n    farmProxyToken {\n      assets {\n        website\n        description\n        status\n        pngUrl\n        svgUrl\n        __typename\n      }\n      decimals\n      name\n      collection\n      ticker\n      __typename\n    }\n    intermediatedPairs\n    intermediatedFarms\n    __typename\n  }\n  simpleLockEnergy {\n    address\n    baseAssetToken {\n      balance\n      decimals\n      name\n      identifier\n      ticker\n      owner\n      assets {\n        website\n        description\n        status\n        pngUrl\n        svgUrl\n        __typename\n      }\n      price\n      type\n      __typename\n    }\n    lockedToken {\n      assets {\n        website\n        description\n        status\n        pngUrl\n        svgUrl\n        __typename\n      }\n      decimals\n      name\n      collection\n      ticker\n      __typename\n    }\n    legacyLockedToken {\n      assets {\n        website\n        description\n        status\n        pngUrl\n        svgUrl\n        __typename\n      }\n      decimals\n      name\n      collection\n      ticker\n      __typename\n    }\n    pauseState\n    lockOptions {\n      lockEpochs\n      penaltyStartPercentage\n      __typename\n    }\n    __typename\n  }\n  farms {\n    ... on FarmModelV2 {\n      address\n      farmToken {\n        assets {\n          website\n          description\n          status\n          pngUrl\n          svgUrl\n          __typename\n        }\n        decimals\n        name\n        collection\n        ticker\n        __typename\n      }\n      farmTokenPriceUSD\n      farmTokenSupply\n      farmingToken {\n        balance\n        decimals\n        name\n        identifier\n        ticker\n        owner\n        assets {\n          website\n          description\n          status\n          pngUrl\n          svgUrl\n          __typename\n        }\n        price\n        type\n        __typename\n      }\n      farmingTokenPriceUSD\n      farmedToken {\n        balance\n        decimals\n        name\n        identifier\n        ticker\n        owner\n        assets {\n          website\n          description\n          status\n          pngUrl\n          svgUrl\n          __typename\n        }\n        price\n        type\n        __typename\n      }\n      farmedTokenPriceUSD\n      pair {\n        address\n        firstToken {\n          balance\n          decimals\n          name\n          identifier\n          ticker\n          owner\n          assets {\n            website\n            description\n            status\n            pngUrl\n            svgUrl\n            __typename\n          }\n          price\n          type\n          __typename\n        }\n        firstTokenPriceUSD\n        secondToken {\n          balance\n          decimals\n          name\n          identifier\n          ticker\n          owner\n          assets {\n            website\n            description\n            status\n            pngUrl\n            svgUrl\n            __typename\n          }\n          price\n          type\n          __typename\n        }\n        secondTokenPriceUSD\n        liquidityPoolToken {\n          balance\n          decimals\n          name\n          identifier\n          ticker\n          owner\n          assets {\n            website\n            description\n            status\n            pngUrl\n            svgUrl\n            __typename\n          }\n          price\n          type\n          __typename\n        }\n        state\n        type\n        info {\n          reserves0\n          reserves1\n          totalSupply\n          __typename\n        }\n        feesAPR\n        totalFeePercent\n        specialFeePercent\n        __typename\n      }\n      state\n      version\n      penaltyPercent\n      perBlockRewards\n      totalValueLockedUSD\n      minimumFarmingEpochs\n      produceRewardsEnabled\n      baseApr\n      energyFactoryAddress\n      boostedYieldsRewardsPercenatage\n      boostedYieldsFactors {\n        maxRewardsFactor\n        userRewardsEnergy\n        userRewardsFarm\n        __typename\n      }\n      boosterRewards {\n        totalEnergyForWeek\n        __typename\n      }\n      optimalEnergyPerLp\n      __typename\n    }\n    __typename\n  }\n}\n",
    }),
  });

  let data;
  try {
    data = await response.json();
  } catch (error) {
    console.log(error);
  }
  if (data?.data?.pairs) {
    const pairs = data.data.pairs as Pair[];
    let blobPair = pairs.find((p) => p.address === addressPool);

    return blobPair;
  } else {
    return undefined;
  }
};

export const watchTransfersByTokenIdentifier = async (poolAddress: string) => {
  const poolInfo = await fetchPoolInfo(poolAddress);
  const isActive = poolInfo?.state === "Active";
  if (poolInfo) {
    console.log(
      `Pool info founded <${poolInfo.firstToken.ticker} | ${
        poolInfo.secondToken.ticker
      }> - ${new Date().toLocaleString()}`
    );

    if (isActive) {
      console.log("Executing buy");
      tryAgainOnError(async () => {
        const tx = await buyToken({
          amountToPay: new BigNumber(amountToBuy).times(1e18).toNumber(),
          tokenToPay: poolInfo.secondToken.identifier,
          tokenToBuy: poolInfo.firstToken.identifier,
          minAmountToBuy: new BigNumber(1)
            .times(10 ** poolInfo.firstToken.decimals)
            .toNumber(),
          scAddress: poolInfo.address,
        });

        bot.sendMessage(
          709820730,
          `
         Compra efectuada
         
Url : ${tx.explorerUrl} 
         `
        );
      });

      return;
    } else {
      console.log("Skip buy");

      setTimeout(() => watchTransfersByTokenIdentifier(poolAddress), 10000);
    }
  } else {
    console.log("Pool not found, Skip buy");

    setTimeout(() => watchTransfersByTokenIdentifier(poolAddress), 10000);
  }
};

tryAgainOnError(() => watchTransfersByTokenIdentifier(poolAddress));

// tryAgainOnError(() => wrapEGLD(3e18, 0));
