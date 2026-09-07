import { registerProvider } from "@unpirator/source-manager";
import { directProvider } from "@unpirator/provider-direct";
import { hlsProvider } from "@unpirator/provider-hls";
import { s3Provider } from "@unpirator/provider-s3";
import { bunnyProvider } from "@unpirator/provider-bunny";
import { youtubeCustomProvider } from "@unpirator/provider-youtube-custom";

registerProvider("direct", directProvider);
registerProvider("r2", s3Provider);
registerProvider("s3", s3Provider);
registerProvider("bunny", bunnyProvider);
registerProvider("hls", hlsProvider);
registerProvider("youtube_custom", youtubeCustomProvider);
