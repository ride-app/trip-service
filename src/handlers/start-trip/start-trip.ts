import { WalletServiceClient } from "@buf/debkanchan_ts-grpc_ride_wallet/ride/wallet/v1alpha1/wallet_service.grpc-client";
import { ChannelCredentials } from "@grpc/grpc-js";

const m = new WalletServiceClient("", ChannelCredentials.createSsl());
