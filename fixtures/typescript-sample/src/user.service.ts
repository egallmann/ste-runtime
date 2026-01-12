/**
 * User service for testing TypeScript extraction.
 */

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  roles: string[];
}

export interface CreateUserDto {
  name: string;
  email: string;
  roles?: string[];
}

export class UserService {
  private users: Map<string, User> = new Map();

  /**
   * Create a new user.
   */
  createUser(dto: CreateUserDto): User {
    const id = crypto.randomUUID();
    const user: User = {
      id,
      name: dto.name,
      email: dto.email,
      createdAt: new Date(),
      roles: dto.roles ?? [],
    };
    this.users.set(id, user);
    return user;
  }

  /**
   * Get a user by ID.
   */
  getUser(id: string): User | undefined {
    return this.users.get(id);
  }

  /**
   * List all users.
   */
  listUsers(): User[] {
    return Array.from(this.users.values());
  }

  /**
   * Delete a user by ID.
   */
  deleteUser(id: string): boolean {
    return this.users.delete(id);
  }

  /**
   * Update a user.
   */
  updateUser(id: string, updates: Partial<CreateUserDto>): User | undefined {
    const user = this.users.get(id);
    if (!user) return undefined;

    const updated: User = {
      ...user,
      ...updates,
    };
    this.users.set(id, updated);
    return updated;
  }
}

export function createUserService(): UserService {
  return new UserService();
}


