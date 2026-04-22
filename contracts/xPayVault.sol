// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title IERC7857
 * @notice Interface for 0G Agent ID Registry (ERC-7857).
 * ERC-7857 defines the technical standard for Intelligent NFTs (iNFTs).
 */
interface IERC7857 {
    function ownerOf(uint256 tokenId) external view returns (address owner);
}

/**
 * @title xPayVault
 * @notice Logic for a consumer-facing AI agent wallet on 0G Chain.
 * @dev This contract acts as a Policy-Driven Escrow, enforcing budgetary guardrails
 * and anchoring transaction receipts to 0G Storage.
 */
contract xPayVault is Ownable, ReentrancyGuard {
    // 0G Agent ID Registry (ERC-7857) Address
    address public agentRegistry;

    struct SpendPolicy {
        uint256 dailyLimit; // Max spend per 24 hours
        uint256 currentDaySpend; // Amount spent in current window
        uint256 lastResetTime; // Timestamp of last limit reset
        uint256 transactionCap; // Max amount per single transaction if vendor is not whitelisted
        bool isRestricted; // Kill-switch for this agent
    }

    mapping(uint256 => SpendPolicy) public agentPolicies; // AgentID => Rules
    mapping(address => bool) public verifiedVendors; // Whitelist for high-trust APIs

    event AgentPaymentExecuted(
        uint256 indexed agentId,
        address indexed vendor,
        uint256 amount,
        bytes32 storageRoot
    );

    event PolicyUpdated(
        uint256 indexed agentId,
        uint256 dailyLimit,
        uint256 transactionCap
    );
    event VendorWhitelisted(address indexed vendor, bool status);
    event AgentRestricted(uint256 indexed agentId, bool status);

    /**
     * @dev Sets the initial owner and agent registry.
     * @param _agentRegistry The address of the ERC-7857 registry on 0G Chain.
     */
    constructor(address _agentRegistry) Ownable(msg.sender) {
        agentRegistry = _agentRegistry;
    }

    /**
     * @dev Sets or updates the spend policy for a specific agent.
     * Can only be called by the vault owner to define guardrails for their AI.
     */
    function setAgentPolicy(
        uint256 agentId,
        uint256 dailyLimit,
        uint256 transactionCap
    ) external onlyOwner {
        SpendPolicy storage policy = agentPolicies[agentId];
        policy.dailyLimit = dailyLimit;
        policy.transactionCap = transactionCap;
        if (policy.lastResetTime == 0) {
            policy.lastResetTime = block.timestamp;
        }
        emit PolicyUpdated(agentId, dailyLimit, transactionCap);
    }

    /**
     * @dev Toggles the restriction state (kill-switch) for an agent.
     */
    function setAgentRestriction(
        uint256 agentId,
        bool status
    ) external onlyOwner {
        agentPolicies[agentId].isRestricted = status;
        emit AgentRestricted(agentId, status);
    }

    /**
     * @dev Whitelists or removes a high-trust vendor.
     */
    function setVendorWhitelist(
        address vendor,
        bool status
    ) external onlyOwner {
        verifiedVendors[vendor] = status;
        emit VendorWhitelisted(vendor, status);
    }

    /**
     * @dev Updates the Agent Registry address if needed.
     */
    function setAgentRegistry(address _agentRegistry) external onlyOwner {
        agentRegistry = _agentRegistry;
    }

    /**
     * @dev Called by the Hono.js backend or the Agent directly to execute a payment.
     * @param agentId The unique 0G Agent ID (iNFT).
     * @param vendor The address of the paywall/API provider.
     * @param storageRoot The hash of the content metadata saved to 0G Storage.
     *
     * Requirement:
     * - The caller must be the owner of the Agent ID (Identity Verification).
     * - The agent must not be restricted.
     * - The payment must fall within the dailyLimit and transactionCap (Budgetary Guardrails).
     */
    function requestAgentPayment(
        uint256 agentId,
        address vendor,
        uint256 amount,
        bytes32 storageRoot
    ) external nonReentrant {
        SpendPolicy storage policy = agentPolicies[agentId];

        // 0. Preliminary Check: Agent Status
        require(!policy.isRestricted, "Agent is restricted");

        // 1. Identity Verification via 0G Registry (ERC-7857)
        // Ensure the person asking the vault to pay is actually the owner of the Agent iNFT.
        require(
            IERC7857(agentRegistry).ownerOf(agentId) == msg.sender,
            "Unauthorized: Agent ID not owned by sender"
        );

        // 2. Budgetary Guardrails: Reset Daily Spend if window has passed
        if (block.timestamp >= policy.lastResetTime + 1 days) {
            policy.currentDaySpend = 0;
            policy.lastResetTime = block.timestamp;
        }

        // 3. Budgetary Guardrails: Enforce Transaction Cap for non-whitelisted vendors
        if (!verifiedVendors[vendor]) {
            require(
                amount <= policy.transactionCap,
                "Amount exceeds transaction cap for non-verified vendor"
            );
        }

        // 4. Budgetary Guardrails: Enforce Daily Limit
        require(
            policy.currentDaySpend + amount <= policy.dailyLimit,
            "Daily spend limit exceeded"
        );

        // 5. Secure Payment Execution
        policy.currentDaySpend += amount;

        (bool success, ) = payable(vendor).call{value: amount}("");
        require(success, "Payment transfer failed");

        // 6. 0G Storage Anchoring: Permanent Receipt in Agent Memory
        emit AgentPaymentExecuted(agentId, vendor, amount, storageRoot);
    }

    /**
     * @dev Allows the owner to deposit native funds into the vault for agent use.
     */
    function deposit() external payable {}

    /**
     * @dev Fallback to receive funds.
     */
    receive() external payable {}

    /**
     * @dev Emergency withdrawal for the vault owner.
     */
    function withdraw(uint256 amount) external onlyOwner {
        payable(msg.sender).transfer(amount);
    }
}
