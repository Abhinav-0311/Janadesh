import jwt, { SignOptions } from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { User, OtpToken } from '../models';
import UserRepository from '../repositories/UserRepository';
import OtpTokenRepository from '../repositories/OtpTokenRepository';
import VoterRegistrationRepository from '../repositories/VoterRegistrationRepository';
import RefreshTokenRepository from '../repositories/RefreshTokenRepository';
import logger from '../utils/logger';
import { ValidationError, UnauthorizedError, ConflictError, ForbiddenError, NotFoundError } from '../types';
import crypto from 'crypto';
import config from '../config';
import EmailService from './EmailService';

export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
}

export interface LoginCredentials {
    email?: string;
    registrationNumber?: string;
    walletAddress?: string;
    otpToken?: string;
}

export interface RegisterData {
    email: string;
    username: string;
    firstName?: string;
    lastName?: string;
    walletAddress?: string;
    registrationNumber?: string;
    role?: 'voter' | 'admin' | 'creator';
}

export interface RefreshTokenPayload {
    userId: string;
    tokenId: string;
    type: 'refresh';
}

export interface AccessTokenPayload {
    userId: string;
    walletAddress: string;
    role: string;
    voterStatus: string;
    isVerified: boolean;
    isEmailVerified: boolean;
    type: 'access';
}

export class AuthService {
    private readonly JWT_SECRET: string;
    private readonly JWT_REFRESH_SECRET: string;
    private readonly JWT_EXPIRES_IN: string;
    private readonly JWT_REFRESH_EXPIRES_IN: string;

    constructor() {
        try {
            this.JWT_SECRET = config.jwt.secret;
            this.JWT_REFRESH_SECRET = config.jwt.refreshSecret;
            this.JWT_EXPIRES_IN = config.jwt.expiresIn;
            this.JWT_REFRESH_EXPIRES_IN = config.jwt.refreshExpiresIn;
        } catch (error) {
            console.error('Error in AuthService constructor:', error);
            throw error;
        }
    }

    async register(userData: RegisterData): Promise<{ user: User; verificationToken: OtpToken; verificationRequired: boolean }> {
        try {
            const existingUser = await this.checkExistingUser(userData);
            if (existingUser) {
                throw new ConflictError(`User already exists with this ${existingUser.field}`);
            }

            const normalizedEmail = userData.email.trim().toLowerCase();
            const registrationNumber = userData.registrationNumber || await this.generateRegistrationNumber();

            const user = await UserRepository.create({
                email: normalizedEmail,
                username: userData.username,
                first_name: userData.firstName,
                last_name: userData.lastName,
                wallet_address: userData.walletAddress || undefined,
                registration_number: registrationNumber,
                is_verified: false,
                is_email_verified: false,
                role: userData.role || 'voter',
                voter_status: 'eligible',
                failed_login_attempts: 0
            });

            const verificationToken = await OtpTokenRepository.generateToken(
                user.id,
                'email_verification',
                60 * 24,
                3,
                JSON.stringify({ email: user.email })
            );

            await EmailService.sendVerificationEmail({
                email: user.email,
                token: verificationToken.token,
                expiresMinutes: 60 * 24,
                displayName: user.first_name || user.username
            });

            logger.info(`User registered successfully: ${user.id}`);
            return { user, verificationToken, verificationRequired: true };

        } catch (error) {
            logger.error('Registration error:', error);
            throw error;
        }
    }

    async verifyEmail(token: string): Promise<{ user: User; message: string }> {
        try {
            const otpToken = await OtpTokenRepository.findByToken(token);
            if (!otpToken || otpToken.token_type !== 'email_verification') {
                throw new UnauthorizedError('Invalid or expired verification token');
            }

            if (otpToken.is_used) {
                throw new UnauthorizedError('Verification token has already been used');
            }

            if (new Date() > otpToken.expires_at) {
                throw new UnauthorizedError('Verification token has expired');
            }

            await OtpTokenRepository.markAsUsed(otpToken.id);

            const user = await UserRepository.update(otpToken.user_id, {
                is_email_verified: true,
                is_verified: true
            });

            if (!user) {
                throw new UnauthorizedError('User not found');
            }

            logger.info(`Email verified for user: ${user.id}`);
            return { user, message: 'Email verified successfully' };

        } catch (error) {
            logger.error('Email verification error:', error);
            throw error;
        }
    }

    async resendEmailVerification(email: string): Promise<{ message: string }> {
        try {
            const user = await UserRepository.findByEmail(email);
            if (!user) {
                throw new NotFoundError('User not found');
            }

            if (user.is_email_verified) {
                throw new ValidationError('Email is already verified');
            }

            const verificationToken = await OtpTokenRepository.generateToken(
                user.id,
                'email_verification',
                60 * 24,
                3,
                JSON.stringify({ email })
            );

            await EmailService.sendVerificationEmail({
                email: user.email,
                token: verificationToken.token,
                expiresMinutes: 60 * 24,
                displayName: user.first_name || user.username
            });

            logger.info(`Email verification token resent for user: ${user.id}`);
            return { message: 'Verification code resent successfully' };
        } catch (error) {
            logger.error('Resend email verification error:', error);
            throw error;
        }
    }

    async initiateLogin(credentials: LoginCredentials): Promise<{ message: string; requiresOtp: boolean; userId: string }> {
        try {
            const user = await this.findUserByCredentials(credentials);
            if (!user) {
                throw new UnauthorizedError('Invalid credentials');
            }

            if (!user.is_email_verified) {
                throw new UnauthorizedError('Please verify your email before logging in');
            }

            if (user.voter_status === 'locked_out' && user.locked_until && new Date() < user.locked_until) {
                throw new UnauthorizedError('Account is temporarily locked. Please try again later.');
            }

            const otpToken = await OtpTokenRepository.generateToken(
                user.id,
                'login',
                15,
                3,
                JSON.stringify({ loginAttempt: new Date().toISOString() })
            );

            await EmailService.sendLoginOtpEmail({
                email: user.email,
                token: otpToken.token,
                expiresMinutes: 15,
                displayName: user.first_name || user.username
            });

            logger.info(`Login OTP generated for user: ${user.id}`);
            return { message: 'OTP sent to your email', requiresOtp: true, userId: user.id };

        } catch (error) {
            logger.error('Login initiation error:', error);
            throw error;
        }
    }

    async completeLogin(credentials: LoginCredentials): Promise<AuthTokens & { user: User }> {
        try {
            if (!credentials.otpToken) {
                throw new ValidationError('OTP token is required');
            }

            const user = await this.findUserByCredentials(credentials);
            if (!user) {
                throw new UnauthorizedError('Invalid credentials');
            }

            const otpToken = await OtpTokenRepository.findActiveToken(user.id, 'login');
            if (!otpToken || otpToken.token !== credentials.otpToken) {
                await this.handleFailedLogin(user.id);
                throw new UnauthorizedError('Invalid OTP token');
            }

            await OtpTokenRepository.markAsUsed(otpToken.id);
            await UserRepository.update(user.id, {
                last_login: new Date(),
                failed_login_attempts: 0,
                locked_until: undefined
            });

            const tokens = await this.generateTokens(user);

            logger.info(`User logged in successfully: ${user.id}`);
            return { ...tokens, user };

        } catch (error) {
            logger.error('Login completion error:', error);
            throw error;
        }
    }

    async refreshToken(refreshToken: string): Promise<AuthTokens> {
        try {
            // Verify JWT signature first
            const decoded = jwt.verify(refreshToken, this.JWT_REFRESH_SECRET) as RefreshTokenPayload;
            if (decoded.type !== 'refresh') {
                throw new UnauthorizedError('Invalid token type');
            }

            // Check if token exists in database and is not used
            const tokenRecord = await RefreshTokenRepository.findByToken(refreshToken);
            if (!tokenRecord) {
                throw new UnauthorizedError('Refresh token not found');
            }
            if (tokenRecord.is_used) {
                throw new UnauthorizedError('Refresh token already used');
            }
            if (new Date() > tokenRecord.expires_at) {
                throw new UnauthorizedError('Refresh token expired');
            }

            // Mark token as used
            await RefreshTokenRepository.markAsUsed(refreshToken);

            // Verify user still exists
            const user = await UserRepository.findById(decoded.userId);
            if (!user) {
                throw new UnauthorizedError('Invalid refresh token');
            }

            // Mark the old refresh token as used
            await RefreshTokenRepository.markAsUsed(refreshToken);

            // Generate new tokens
            const tokens = await this.generateTokens(user);

            logger.info(`Token refreshed for user: ${user.id}`);
            return tokens;

        } catch (error: any) {
            logger.error('Token refresh error:', error);
            if (error instanceof UnauthorizedError) {
                throw error;
            }
            throw new UnauthorizedError('Invalid refresh token');
        }
    }

    async generateVotingAccessToken(userId: string, electionId: string): Promise<{ votingToken: string; expiresIn: number }> {
        try {
            const user = await UserRepository.findById(userId);
            if (!user) {
                throw new UnauthorizedError('User not found');
            }

            if (!user.is_verified || !user.is_email_verified) {
                throw new ForbiddenError('User must be verified to access voting');
            }

            const isRegistered = await VoterRegistrationRepository.isUserRegistered(userId, electionId);
            if (!isRegistered) {
                throw new ForbiddenError('User is not registered for this election');
            }

            const votingToken = await OtpTokenRepository.generateToken(
                userId,
                'voting_access',
                60,
                1,
                JSON.stringify({ electionId, generatedAt: new Date().toISOString() })
            );

            logger.info(`Voting access token generated for user: ${userId}, election: ${electionId}`);
            return { votingToken: votingToken.token, expiresIn: 3600 };

        } catch (error) {
            logger.error('Voting access token generation error:', error);
            throw error;
        }
    }

    async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
        try {
            const decoded = jwt.verify(token, this.JWT_SECRET) as Partial<AccessTokenPayload>;

            // Backward-compatibility: older test/legacy tokens may not include `type`.
            // If present, it must be `access`.
            if (decoded.type && decoded.type !== 'access') {
                throw new UnauthorizedError('Invalid token type');
            }

            if (!decoded.userId) {
                throw new UnauthorizedError('Invalid token payload');
            }

            // Verify user still exists and token data matches
            const user = await UserRepository.findById(decoded.userId);
            if (!user) {
                throw new UnauthorizedError('User not found');
            }

            // Validate token data matches current user data (session hijacking detection)
            if (decoded.walletAddress && user.wallet_address && decoded.walletAddress !== user.wallet_address) {
                throw new UnauthorizedError('Session validation failed');
            }

            // Role drift can happen after legitimate admin-driven updates while old tokens are still valid.
            // Keep strict tamper detection only for admin role mismatches to prevent privilege confusion.
            if (decoded.role && decoded.role !== user.role && (decoded.role === 'admin' || user.role === 'admin')) {
                throw new ForbiddenError('Token tampering detected');
            }

            return {
                userId: user.id,
                walletAddress: user.wallet_address || decoded.walletAddress || '',
                role: user.role,
                voterStatus: user.voter_status,
                isVerified: user.is_verified,
                isEmailVerified: user.is_email_verified,
                type: 'access'
            };

        } catch (error: any) {
            logger.error('Token verification error:', error);

            // Provide specific error messages for different JWT errors
            if (error.name === 'TokenExpiredError') {
                throw new UnauthorizedError('Token has expired');
            }

            if (error.name === 'JsonWebTokenError') {
                throw new UnauthorizedError('Invalid token');
            }

            if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
                throw error;
            }

            throw new UnauthorizedError('Invalid access token');
        }
    }

    private async checkExistingUser(userData: RegisterData): Promise<{ field: string } | null> {
        if (userData.email) {
            const existingByEmail = await UserRepository.findByEmail(userData.email);
            if (existingByEmail) {
                return { field: 'email' };
            }
        }

        if (userData.registrationNumber) {
            const existingByRegistration = await UserRepository.findByRegistrationNumber(userData.registrationNumber);
            if (existingByRegistration) {
                return { field: 'registration number' };
            }
        }

        const existingByUsername = await UserRepository.findByUsername(userData.username);
        if (existingByUsername) {
            return { field: 'username' };
        }

        if (userData.walletAddress) {
            const existingByWallet = await UserRepository.findByWalletAddress(userData.walletAddress);
            if (existingByWallet) {
                return { field: 'wallet address' };
            }
        }

        return null;
    }

    private async generateRegistrationNumber(): Promise<string> {
        const prefix = 'REG';
        const timestamp = Date.now().toString().slice(-6);
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `${prefix}-${timestamp}-${random}`;
    }

    private async findUserByCredentials(credentials: LoginCredentials): Promise<User | null> {
        if (credentials.email) {
            return await UserRepository.findByEmail(credentials.email);
        }
        if (credentials.registrationNumber) {
            return await UserRepository.findByRegistrationNumber(credentials.registrationNumber);
        }
        if (credentials.walletAddress) {
            return await UserRepository.findByWalletAddress(credentials.walletAddress);
        }
        return null;
    }

    private async handleFailedLogin(userId: string): Promise<void> {
        const user = await UserRepository.findById(userId);
        if (!user) return;

        const failedAttempts = user.failed_login_attempts + 1;
        const updates: Partial<User> = { failed_login_attempts: failedAttempts };

        if (failedAttempts >= 5) {
            updates.locked_until = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
            updates.voter_status = 'locked_out';
        }

        await UserRepository.update(userId, updates);
    }

    private async generateTokens(user: User): Promise<AuthTokens> {
        const accessPayload: AccessTokenPayload = {
            userId: user.id,
            walletAddress: user.wallet_address || '',
            role: user.role,
            voterStatus: user.voter_status,
            isVerified: user.is_verified,
            isEmailVerified: user.is_email_verified,
            type: 'access'
        };

        const refreshPayload: RefreshTokenPayload = {
            userId: user.id,
            tokenId: crypto.randomUUID(),
            type: 'refresh'
        };

        const accessToken = jwt.sign(accessPayload, this.JWT_SECRET, { expiresIn: this.JWT_EXPIRES_IN } as SignOptions);
        const refreshToken = jwt.sign(refreshPayload, this.JWT_REFRESH_SECRET, { expiresIn: this.JWT_REFRESH_EXPIRES_IN } as SignOptions);

        // Store refresh token in database (optional - table may not exist yet)
        try {
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now
            await RefreshTokenRepository.storeToken(user.id, refreshToken, expiresAt);
        } catch (error) {
            // Ignore if table doesn't exist yet
            logger.warn('Could not store refresh token - table may not exist');
        }

        return {
            accessToken,
            refreshToken,
            expiresIn: 24 * 60 * 60 // 24 hours in seconds
        };
    }

    /**
     * Check if user has required role
     */
    hasRole(userRole: string, requiredRoles: string[]): boolean {
        return requiredRoles.includes(userRole);
    }

    /**
     * Check if user can perform specific action
     */
    canPerformAction(userRole: string, action: string): boolean {
        const rolePermissions: { [key: string]: string[] } = {
            'admin': ['*'], // Admin can do everything
            'creator': ['create_election', 'manage_election', 'view_results'],
            'voter': ['vote', 'view_elections', 'view_profile']
        };

        const permissions = rolePermissions[userRole] || [];
        return permissions.includes('*') || permissions.includes(action);
    }
}

// Export singleton instance as default
const authServiceInstance = new AuthService();
export default authServiceInstance;
