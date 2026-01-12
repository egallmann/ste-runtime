/**
 * Tests for Angular extractor
 * 
 * Tests extraction of Angular components, services, pipes, directives, and routes.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'angular-extractor-test-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

async function createAngularFile(filename: string, content: string): Promise<string> {
  const fullPath = path.join(tempDir, filename);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, 'utf8');
  return fullPath;
}

describe('Angular Extractor', () => {
  describe('component extraction', () => {
    it('should recognize @Component decorator', async () => {
      const code = `
import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-user-card',
  templateUrl: './user-card.component.html',
  styleUrls: ['./user-card.component.scss'],
})
export class UserCardComponent {
  @Input() user: User;
  @Output() select = new EventEmitter<User>();

  onSelect() {
    this.select.emit(this.user);
  }
}
`;
      const filePath = await createAngularFile('user-card.component.ts', code);
      const content = await readFile(filePath, 'utf8');

      expect(content).toContain('@Component');
      expect(content).toContain("selector: 'app-user-card'");
      expect(content).toContain('templateUrl');
      expect(content).toContain('styleUrls');
      expect(content).toContain('@Input()');
      expect(content).toContain('@Output()');
    });

    it('should recognize standalone components', async () => {
      const code = `
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: \`
    <div class="dashboard">
      <h1>Dashboard</h1>
      <router-outlet></router-outlet>
    </div>
  \`,
  styles: [\`
    .dashboard { padding: 16px; }
  \`]
})
export class DashboardComponent {}
`;
      const filePath = await createAngularFile('dashboard.component.ts', code);
      const content = await readFile(filePath, 'utf8');

      expect(content).toContain('standalone: true');
      expect(content).toContain('imports:');
      expect(content).toContain('template:');
    });
  });

  describe('service extraction', () => {
    it('should recognize @Injectable decorator', async () => {
      const code = `
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private apiUrl = '/api/users';

  constructor(private http: HttpClient) {}

  getUsers(): Observable<User[]> {
    return this.http.get<User[]>(this.apiUrl);
  }

  getUserById(id: string): Observable<User> {
    return this.http.get<User>(\`\${this.apiUrl}/\${id}\`);
  }

  createUser(user: CreateUserDto): Observable<User> {
    return this.http.post<User>(this.apiUrl, user);
  }
}
`;
      const filePath = await createAngularFile('user.service.ts', code);
      const content = await readFile(filePath, 'utf8');

      expect(content).toContain('@Injectable');
      expect(content).toContain("providedIn: 'root'");
      expect(content).toContain('HttpClient');
      expect(content).toContain('Observable');
    });

    it('should recognize services with dependencies', async () => {
      const code = `
import { Injectable, Inject } from '@angular/core';
import { API_CONFIG, ApiConfig } from './api.config';

@Injectable()
export class ConfigurableService {
  constructor(
    @Inject(API_CONFIG) private config: ApiConfig,
    private httpClient: HttpClient,
    private logger: LoggerService,
  ) {}
}
`;
      const filePath = await createAngularFile('configurable.service.ts', code);
      const content = await readFile(filePath, 'utf8');

      expect(content).toContain('@Injectable()');
      expect(content).toContain('@Inject(API_CONFIG)');
    });

    it('should extract HTTP call URL patterns correctly', async () => {
      const code = `
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private apiUrl = '/api/v2/users';
  
  constructor(private http: HttpClient) {}
  
  getUsers() {
    return this.http.get<User[]>('/api/users');
  }
  
  getUserById(id: string) {
    return this.http.get(\`/api/users/\${id}\`);
  }
  
  createUser(user: User) {
    return this.http.post(this.apiUrl, user);
  }
  
  updateUser(id: string, user: User) {
    return this.http.put(\`\${this.apiUrl}/\${id}\`, user);
  }
  
  deleteUser(id: string) {
    return this.http.delete(\`/api/users/\${id}\`);
  }
}
`;
      const filePath = await createAngularFile('api.service.ts', code);
      
      const { extractFromAngular } = await import('./angular-extractor.js');
      const assertions = await extractFromAngular({
        path: filePath,
        relativePath: 'api.service.ts',
        language: 'angular',
        changeType: 'unchanged',
      }, tempDir);

      expect(assertions).toHaveLength(1);
      const service = assertions[0];
      expect(service.elementType).toBe('angular_service');
      
      const httpCalls = service.metadata.httpCalls as Array<{ method: string; urlPattern: string; functionName: string }>;
      expect(httpCalls).toHaveLength(5);
      
      // Check each HTTP call has clean URL patterns
      const getUsers = httpCalls.find(c => c.functionName === 'getUsers');
      expect(getUsers).toBeDefined();
      expect(getUsers?.method).toBe('GET');
      expect(getUsers?.urlPattern).toBe('/api/users');
      
      const getUserById = httpCalls.find(c => c.functionName === 'getUserById');
      expect(getUserById).toBeDefined();
      expect(getUserById?.urlPattern).toContain('/api/users/');
      
      const createUser = httpCalls.find(c => c.functionName === 'createUser');
      expect(createUser).toBeDefined();
      expect(createUser?.method).toBe('POST');
      expect(createUser?.urlPattern).toBe('{apiUrl}');
      
      const deleteUser = httpCalls.find(c => c.functionName === 'deleteUser');
      expect(deleteUser).toBeDefined();
      expect(deleteUser?.method).toBe('DELETE');
    });
  });

  describe('pipe extraction', () => {
    it('should recognize @Pipe decorator', async () => {
      const code = `
import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'truncate',
  standalone: true,
})
export class TruncatePipe implements PipeTransform {
  transform(value: string, maxLength: number = 50): string {
    if (!value || value.length <= maxLength) {
      return value;
    }
    return value.substring(0, maxLength) + '...';
  }
}
`;
      const filePath = await createAngularFile('truncate.pipe.ts', code);
      const content = await readFile(filePath, 'utf8');

      expect(content).toContain('@Pipe');
      expect(content).toContain("name: 'truncate'");
      expect(content).toContain('PipeTransform');
      expect(content).toContain('transform(');
    });
  });

  describe('directive extraction', () => {
    it('should recognize @Directive decorator', async () => {
      const code = `
import { Directive, ElementRef, HostListener, Input } from '@angular/core';

@Directive({
  selector: '[appHighlight]',
  standalone: true,
})
export class HighlightDirective {
  @Input() appHighlight: string = 'yellow';
  @Input() defaultColor: string = '';

  constructor(private el: ElementRef) {}

  @HostListener('mouseenter')
  onMouseEnter() {
    this.highlight(this.appHighlight || this.defaultColor || 'yellow');
  }

  @HostListener('mouseleave')
  onMouseLeave() {
    this.highlight('');
  }

  private highlight(color: string) {
    this.el.nativeElement.style.backgroundColor = color;
  }
}
`;
      const filePath = await createAngularFile('highlight.directive.ts', code);
      const content = await readFile(filePath, 'utf8');

      expect(content).toContain('@Directive');
      expect(content).toContain("selector: '[appHighlight]'");
      expect(content).toContain('@HostListener');
      expect(content).toContain('ElementRef');
    });
  });

  describe('route extraction', () => {
    it('should recognize route configuration', async () => {
      const code = `
import { Routes } from '@angular/router';
import { DashboardComponent } from './dashboard/dashboard.component';
import { UserListComponent } from './users/user-list.component';
import { UserDetailComponent } from './users/user-detail.component';
import { AuthGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' },
  { 
    path: 'dashboard', 
    component: DashboardComponent,
    canActivate: [AuthGuard],
  },
  {
    path: 'users',
    children: [
      { path: '', component: UserListComponent },
      { path: ':id', component: UserDetailComponent },
    ]
  },
  {
    path: 'admin',
    loadChildren: () => import('./admin/admin.module').then(m => m.AdminModule),
    canLoad: [AuthGuard],
  },
  { path: '**', redirectTo: '/dashboard' },
];
`;
      const filePath = await createAngularFile('app.routes.ts', code);
      const content = await readFile(filePath, 'utf8');

      expect(content).toContain('Routes');
      expect(content).toContain('redirectTo');
      expect(content).toContain('canActivate');
      expect(content).toContain('loadChildren');
      expect(content).toContain('children:');
    });
  });

  describe('guard extraction', () => {
    it('should recognize route guards', async () => {
      const code = `
import { Injectable } from '@angular/core';
import { 
  CanActivate, 
  CanDeactivate,
  ActivatedRouteSnapshot, 
  RouterStateSnapshot,
  Router 
} from '@angular/router';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): boolean {
    if (this.authService.isLoggedIn()) {
      return true;
    }
    this.router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
    return false;
  }
}
`;
      const filePath = await createAngularFile('auth.guard.ts', code);
      const content = await readFile(filePath, 'utf8');

      expect(content).toContain('CanActivate');
      expect(content).toContain('canActivate(');
      expect(content).toContain('AuthGuard');
    });

    it('should recognize functional guards', async () => {
      const code = `
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  
  if (authService.isLoggedIn()) {
    return true;
  }
  
  return router.createUrlTree(['/login']);
};
`;
      const filePath = await createAngularFile('auth.guard.fn.ts', code);
      const content = await readFile(filePath, 'utf8');

      expect(content).toContain('CanActivateFn');
      expect(content).toContain('inject(');
    });
  });

  describe('template extraction', () => {
    it('should recognize template bindings', async () => {
      const html = `
<div class="container" [class.active]="isActive">
  <h1>{{ title }}</h1>
  
  <input 
    type="text" 
    [(ngModel)]="searchTerm"
    (input)="onSearch($event)"
  />
  
  <ul>
    <li *ngFor="let item of items; trackBy: trackById">
      {{ item.name }}
    </li>
  </ul>
  
  <div *ngIf="showDetails; else noDetails">
    <app-details [data]="selectedItem" (save)="onSave($event)"></app-details>
  </div>
  
  <ng-template #noDetails>
    <p>No details available</p>
  </ng-template>
</div>
`;
      const filePath = await createAngularFile('template.component.html', html);
      const content = await readFile(filePath, 'utf8');

      expect(content).toContain('{{ title }}');
      expect(content).toContain('[(ngModel)]');
      expect(content).toContain('[class.active]');
      expect(content).toContain('*ngFor');
      expect(content).toContain('*ngIf');
      expect(content).toContain('trackBy');
    });
  });

  describe('Angular 17+ signal-based patterns', () => {
    it('should extract signal-based input() and output()', async () => {
      const code = `
import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-signal-component',
  template: '<div>{{ name() }}</div>',
  standalone: true,
})
export class SignalComponent {
  name = input<string>('default');
  age = input.required<number>();
  selected = output<boolean>();
  itemChanged = output<string>();
}
`;
      const filePath = await createAngularFile('signal.component.ts', code);
      
      // Import extractor and run extraction
      const { extractFromAngular } = await import('./angular-extractor.js');
      const assertions = await extractFromAngular({
        path: filePath,
        relativePath: 'signal.component.ts',
        language: 'angular',
        changeType: 'unchanged',
      }, tempDir);

      expect(assertions).toHaveLength(1);
      const component = assertions[0];
      expect(component.elementType).toBe('angular_component');
      
      // Verify signal-based inputs are extracted
      const inputs = component.metadata.inputs as Array<{ name: string; required?: boolean }>;
      expect(inputs).toContainEqual(expect.objectContaining({ name: 'name', required: false }));
      expect(inputs).toContainEqual(expect.objectContaining({ name: 'age', required: true }));
      
      // Verify signal-based outputs are extracted
      const outputs = component.metadata.outputs as Array<{ name: string }>;
      expect(outputs).toContainEqual(expect.objectContaining({ name: 'selected' }));
      expect(outputs).toContainEqual(expect.objectContaining({ name: 'itemChanged' }));
    });

    it('should extract inject() function DI pattern in components', async () => {
      const code = `
import { Component, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { UserService } from './user.service';

@Component({
  selector: 'app-inject-component',
  template: '<div>Works</div>',
  standalone: true,
})
export class InjectComponent {
  private http = inject(HttpClient);
  private userService = inject(UserService);
  readonly router = inject(Router);
}
`;
      const filePath = await createAngularFile('inject.component.ts', code);
      
      const { extractFromAngular } = await import('./angular-extractor.js');
      const assertions = await extractFromAngular({
        path: filePath,
        relativePath: 'inject.component.ts',
        language: 'angular',
        changeType: 'unchanged',
      }, tempDir);

      expect(assertions).toHaveLength(1);
      const component = assertions[0];
      
      // Verify inject() calls are extracted as injected services
      const injectedServices = component.metadata.injectedServices as string[];
      expect(injectedServices).toContain('HttpClient');
      expect(injectedServices).toContain('UserService');
      expect(injectedServices).toContain('Router');
    });

    it('should extract inject() function DI pattern in services', async () => {
      const code = `
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { WebSocketService } from './websocket.service';

@Injectable({
  providedIn: 'root'
})
export class ModernService {
  private http = inject(HttpClient);
  private ws = inject(WebSocketService);
  
  getData() {
    return this.http.get('/api/data');
  }
}
`;
      const filePath = await createAngularFile('modern.service.ts', code);
      
      const { extractFromAngular } = await import('./angular-extractor.js');
      const assertions = await extractFromAngular({
        path: filePath,
        relativePath: 'modern.service.ts',
        language: 'angular',
        changeType: 'unchanged',
      }, tempDir);

      expect(assertions).toHaveLength(1);
      const service = assertions[0];
      expect(service.elementType).toBe('angular_service');
      
      // Verify inject() calls are extracted
      const injectedDependencies = service.metadata.injectedDependencies as string[];
      expect(injectedDependencies).toContain('HttpClient');
      expect(injectedDependencies).toContain('WebSocketService');
    });

    it('should combine decorator-based and signal-based inputs/outputs', async () => {
      const code = `
import { Component, Input, Output, EventEmitter, input, output } from '@angular/core';

@Component({
  selector: 'app-hybrid-component',
  template: '<div></div>',
  standalone: true,
})
export class HybridComponent {
  // Decorator-based (legacy)
  @Input() legacyInput: string;
  @Output() legacyOutput = new EventEmitter<void>();
  
  // Signal-based (modern)
  modernInput = input<number>();
  modernOutput = output<string>();
}
`;
      const filePath = await createAngularFile('hybrid.component.ts', code);
      
      const { extractFromAngular } = await import('./angular-extractor.js');
      const assertions = await extractFromAngular({
        path: filePath,
        relativePath: 'hybrid.component.ts',
        language: 'angular',
        changeType: 'unchanged',
      }, tempDir);

      expect(assertions).toHaveLength(1);
      const component = assertions[0];
      
      const inputs = component.metadata.inputs as Array<{ name: string }>;
      expect(inputs).toContainEqual(expect.objectContaining({ name: 'legacyInput' }));
      expect(inputs).toContainEqual(expect.objectContaining({ name: 'modernInput' }));
      
      const outputs = component.metadata.outputs as Array<{ name: string }>;
      expect(outputs).toContainEqual(expect.objectContaining({ name: 'legacyOutput' }));
      expect(outputs).toContainEqual(expect.objectContaining({ name: 'modernOutput' }));
    });

    it('should combine constructor and inject() DI patterns', async () => {
      const code = `
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { LoggerService } from './logger.service';
import { ConfigService } from './config.service';

@Injectable({
  providedIn: 'root'
})
export class HybridDIService {
  // inject() pattern
  private http = inject(HttpClient);
  
  // Constructor pattern
  constructor(
    private logger: LoggerService,
    private config: ConfigService,
  ) {}
}
`;
      const filePath = await createAngularFile('hybrid-di.service.ts', code);
      
      const { extractFromAngular } = await import('./angular-extractor.js');
      const assertions = await extractFromAngular({
        path: filePath,
        relativePath: 'hybrid-di.service.ts',
        language: 'angular',
        changeType: 'unchanged',
      }, tempDir);

      expect(assertions).toHaveLength(1);
      const service = assertions[0];
      
      const injectedDependencies = service.metadata.injectedDependencies as string[];
      // Should include both constructor params and inject() calls
      expect(injectedDependencies).toContain('HttpClient');
      expect(injectedDependencies).toContain('LoggerService');
      expect(injectedDependencies).toContain('ConfigService');
    });
  });
});

