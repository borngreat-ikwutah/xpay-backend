// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title AgentNFT
 * @notice Implementation of ERC-7857 for Intelligent NFTs (iNFTs) on 0G Chain.
 * @dev This contract manages the ownership and metadata of AI agents.
 */
contract AgentNFT is ERC721URIStorage, Ownable {
    uint256 private _nextTokenId;

    // Metadata for the AI Agent
    struct AgentMetadata {
        string modelType; // e.g., "Llama-3-70B"
        string systemPrompt; // Encrypted or hash of the agent's core instructions
        bytes32 memoryRoot; // Initial state root on 0G Storage
    }

    mapping(uint256 => AgentMetadata) public agentMetadata;

    event AgentMinted(
        uint256 indexed tokenId,
        address indexed owner,
        string modelType
    );

    constructor() ERC721("0G Intelligent Agent", "iNFT") Ownable(msg.sender) {}

    /**
     * @notice Mints a new AI Agent identity.
     * @param to The address that will own the Agent.
     * @param uri The metadata URI (standard ERC721).
     * @param modelType The type of AI model.
     * @param memoryRoot Initial 0G Storage state root.
     */
    function mintAgent(
        address to,
        string memory uri,
        string memory modelType,
        bytes32 memoryRoot
    ) public returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);

        agentMetadata[tokenId] = AgentMetadata({
            modelType: modelType,
            systemPrompt: "", // Set via separate encrypted channel or update
            memoryRoot: memoryRoot
        });

        emit AgentMinted(tokenId, to, modelType);
        return tokenId;
    }

    /**
     * @notice Updates the memory root hash (anchoring agent memory to 0G Storage).
     */
    function updateMemoryRoot(uint256 tokenId, bytes32 newRoot) public {
        require(ownerOf(tokenId) == msg.sender, "Not the agent owner");
        agentMetadata[tokenId].memoryRoot = newRoot;
    }
}
