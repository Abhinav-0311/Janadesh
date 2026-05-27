export class AuthService {
  async test(): Promise<string> {
    return 'test';
  }
}

const authService = new AuthService();
export default authService;