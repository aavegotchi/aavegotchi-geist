pragma solidity 0.8.1;

import {LibVrf} from "../libraries/LibVrf.sol";

//to totally circumvent chainlink contracct solidity version requirements
interface IVRF {
    function requestRandomWords(LibVrf.RandomWordsRequest calldata req) external returns (uint256 requestId);
}
