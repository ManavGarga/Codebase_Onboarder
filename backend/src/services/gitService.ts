import { execFile } from 'child_process';
import util from 'util';
import fs from 'fs';
import path from 'path';
import dns from 'dns';
import { URL } from 'url';

const execFileAsync = util.promisify(execFile);

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  children?: FileTreeNode[];
}

export class GitService {
  /**
   * Check if an IP address is private, loopback, link-local, or reserved.
   */
  isPrivateOrBlockedIP(ip: string): boolean {
    const cleanIp = ip.trim().replace(/^::ffff:/, '');

    // IPv4 checks
    const ipv4Parts = cleanIp.split('.').map(Number);
    if (ipv4Parts.length === 4 && ipv4Parts.every((p) => !isNaN(p) && p >= 0 && p <= 255)) {
      const [a, b] = ipv4Parts;
      // 127.0.0.0/8 (loopback)
      if (a === 127) return true;
      // 10.0.0.0/8 (RFC 1918)
      if (a === 10) return true;
      // 172.16.0.0/12 (RFC 1918)
      if (a === 172 && b >= 16 && b <= 31) return true;
      // 192.168.0.0/16 (RFC 1918)
      if (a === 192 && b === 168) return true;
      // 169.254.0.0/16 (link-local, cloud metadata)
      if (a === 169 && b === 254) return true;
      // 0.0.0.0/8
      if (a === 0) return true;
      // 100.64.0.0/10 (carrier NAT)
      if (a === 100 && b >= 64 && b <= 127) return true;
      // 224.0.0.0/4 (multicast) and 240.0.0.0/4 (reserved)
      if (a >= 224) return true;
      return false;
    }

    // IPv6 checks
    const lower = cleanIp.toLowerCase();
    if (lower === '::1' || lower === '::' || lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) {
      return true;
    }

    return false;
  }

  /**
   * Validate and parse a GitHub repository URL with strict SSRF and schema defenses.
   */
  async validateAndParseGithubUrl(url: string): Promise<{ owner: string; name: string; normalizedUrl: string }> {
    if (!url || typeof url !== 'string') {
      throw new Error('Repository URL must be a non-empty string.');
    }

    const trimmed = url.trim();

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(trimmed);
    } catch {
      throw new Error(`Invalid URL format: "${trimmed}".`);
    }

    // 1. Protocol whitelist: HTTPS only
    if (parsedUrl.protocol !== 'https:') {
      throw new Error(`Forbidden protocol: "${parsedUrl.protocol}". Only "https:" is permitted.`);
    }

    // 2. Hostname whitelist: github.com or www.github.com
    const host = parsedUrl.hostname.toLowerCase();
    const allowedHosts = new Set(['github.com', 'www.github.com']);
    if (!allowedHosts.has(host)) {
      throw new Error(`Unauthorized repository host "${host}". Only GitHub is supported.`);
    }

    // 3. DNS pre-flight verification to prevent SSRF / DNS rebinding
    try {
      const addresses = await dns.promises.lookup(host, { all: true });
      for (const addr of addresses) {
        if (this.isPrivateOrBlockedIP(addr.address)) {
          throw new Error(`SSRF detected: host "${host}" resolved to restricted IP "${addr.address}".`);
        }
      }
    } catch (err: any) {
      if (err.message?.includes('SSRF detected')) throw err;
      throw new Error(`DNS resolution failed for host "${host}": ${err.message}`);
    }

    // 4. Pathname parsing & sanitization (strictly /owner/repo or /owner/repo.git)
    const cleanPath = parsedUrl.pathname.replace(/\/+$/, '');
    const pathRegex = /^\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git)?$/;
    const match = cleanPath.match(pathRegex);

    if (!match) {
      throw new Error(`Invalid GitHub repository path: "${parsedUrl.pathname}". Format must be /owner/repo`);
    }

    const owner = match[1];
    const name = match[2];

    // Prevent directory traversal inside names
    if (owner === '.' || owner === '..' || name === '.' || name === '..') {
      throw new Error('Invalid repository owner or name.');
    }

    const normalizedUrl = `https://github.com/${owner}/${name}`;
    return { owner, name, normalizedUrl };
  }

  /**
   * Synchronous parse helper maintaining backwards compatibility.
   */
  parseGithubUrl(url: string): { owner: string; name: string } {
    if (!url || typeof url !== 'string') {
      throw new Error('Repository URL must be a non-empty string.');
    }

    const trimmed = url.trim();
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(trimmed);
    } catch {
      throw new Error(`Invalid GitHub repository URL: "${url}". Format must be https://github.com/owner/repo`);
    }

    if (parsedUrl.protocol !== 'https:') {
      throw new Error(`Invalid GitHub repository URL: "${url}". Only https protocol is supported.`);
    }

    const host = parsedUrl.hostname.toLowerCase();
    if (host !== 'github.com' && host !== 'www.github.com') {
      throw new Error(`Invalid GitHub repository URL: "${url}". Format must be https://github.com/owner/repo`);
    }

    const cleanPath = parsedUrl.pathname.replace(/\/+$/, '');
    const pathRegex = /^\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git)?$/;
    const match = cleanPath.match(pathRegex);
    if (!match) {
      throw new Error(`Invalid GitHub repository URL: "${url}". Format must be https://github.com/owner/repo`);
    }

    return {
      owner: match[1],
      name: match[2],
    };
  }

  /**
   * Sanitize branch name to prevent command and flag injection.
   */
  sanitizeBranch(branch: string): string {
    const trimmed = branch.trim();
    if (!trimmed) return 'main';

    // Must not start with a dash (-) to prevent git option injection
    if (trimmed.startsWith('-')) {
      throw new Error(`Invalid branch name "${trimmed}": cannot begin with a dash.`);
    }

    // Prevent path traversal sequences
    if (trimmed.includes('..')) {
      throw new Error(`Invalid branch name "${trimmed}": path traversal characters not permitted.`);
    }

    // Only allow alphanumeric, underscore, dot, hyphen, forward slash
    const branchRegex = /^[a-zA-Z0-9_.\-/]+$/;
    if (!branchRegex.test(trimmed)) {
      throw new Error(`Invalid branch name "${trimmed}": contains illegal characters.`);
    }

    return trimmed;
  }

  /**
   * Securely clone repository using execFile with hard limits, disabled hooks, and argument isolation.
   */
  async cloneRepository(repoUrl: string, targetPath: string, branch: string = 'main', accessToken?: string): Promise<void> {
    const { normalizedUrl } = await this.validateAndParseGithubUrl(repoUrl);
    const sanitizedBranch = this.sanitizeBranch(branch);

    let cloneUrl = normalizedUrl;
    if (accessToken) {
      const { owner, name } = this.parseGithubUrl(normalizedUrl);
      cloneUrl = `https://x-access-token:${accessToken}@github.com/${owner}/${name}.git`;
    }

    if (fs.existsSync(targetPath)) {
      console.log(`[GitService] Path ${targetPath} already exists. Cleaning up before clone.`);
      fs.rmSync(targetPath, { recursive: true, force: true });
    }

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });

    // Hardened git options:
    // 1. Disable hooks execution (-c core.hooksPath=/dev/null)
    // 2. Disable external protocols (-c protocol.ext.allow=never)
    // 3. Disable fsmonitor hook (-c core.fsmonitor=)
    // 4. Cap pack/object size to prevent archive explosion (-c core.bigFileThreshold=10m)
    const baseGitArgs = [
      '-c', 'core.hooksPath=/dev/null',
      '-c', 'protocol.ext.allow=never',
      '-c', 'core.fsmonitor=',
      '-c', 'core.bigFileThreshold=10m',
      'clone',
      '--depth', '1',
      '--single-branch',
    ];

    console.log(`[GitService] Shallow cloning repository (branch: ${sanitizedBranch}) into ${targetPath}...`);
    try {
      const argsWithBranch = [...baseGitArgs, '--branch', sanitizedBranch, '--', cloneUrl, targetPath];
      await execFileAsync('git', argsWithBranch, {
        timeout: 120000,
        maxBuffer: 10 * 1024 * 1024,
      });
    } catch (err) {
      console.warn(`[GitService] Clone with branch ${sanitizedBranch} failed, trying default clone...`);
      const defaultArgs = [...baseGitArgs, '--', cloneUrl, targetPath];
      await execFileAsync('git', defaultArgs, {
        timeout: 120000,
        maxBuffer: 10 * 1024 * 1024,
      });
    }
  }

  /**
   * Fetches the current commit SHA of a repository checkout.
   */
  async getCommitSha(repoPath: string): Promise<string> {
    try {
      const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
        cwd: repoPath,
        timeout: 10000,
      });
      return stdout.trim();
    } catch (err: any) {
      console.warn(`[GitService] Could not resolve commit SHA at ${repoPath}: ${err.message}`);
      return '';
    }
  }

  /**
   * Synchronizes repository: clones if fresh, or fetches and computes git diff if already existing.
   */
  async syncRepository(
    repoUrl: string,
    targetPath: string,
    branch: string = 'main',
    accessToken?: string
  ): Promise<{
    oldCommit?: string;
    newCommit: string;
    isIncremental: boolean;
    changedFiles: string[];
    addedFiles: string[];
    deletedFiles: string[];
  }> {
    const gitDir = path.join(targetPath, '.git');
    const isExisting = fs.existsSync(gitDir);

    if (!isExisting) {
      await this.cloneRepository(repoUrl, targetPath, branch, accessToken);
      const newCommit = await this.getCommitSha(targetPath);
      return {
        newCommit,
        isIncremental: false,
        changedFiles: [],
        addedFiles: [],
        deletedFiles: [],
      };
    }

    // Repository checkout already exists: perform incremental sync
    const sanitizedBranch = this.sanitizeBranch(branch);
    const oldCommit = await this.getCommitSha(targetPath);

    try {
      console.log(`[GitService] Fetching latest commits for ${sanitizedBranch} in ${targetPath}...`);
      await execFileAsync('git', ['fetch', '--depth', '5', 'origin', sanitizedBranch], {
        cwd: targetPath,
        timeout: 60000,
      });
      await execFileAsync('git', ['checkout', sanitizedBranch], {
        cwd: targetPath,
        timeout: 30000,
      });
      await execFileAsync('git', ['reset', '--hard', `origin/${sanitizedBranch}`], {
        cwd: targetPath,
        timeout: 30000,
      });
    } catch (err) {
      console.warn(`[GitService] Git fetch/pull failed (${err}), falling back to existing checkout.`);
    }

    const newCommit = await this.getCommitSha(targetPath);

    const changedFiles: string[] = [];
    const addedFiles: string[] = [];
    const deletedFiles: string[] = [];

    if (oldCommit && newCommit && oldCommit !== newCommit) {
      try {
        const { stdout } = await execFileAsync('git', ['diff', '--name-status', oldCommit, newCommit], {
          cwd: targetPath,
          timeout: 30000,
        });

        for (const line of stdout.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const [status, ...fileParts] = trimmed.split(/\s+/);
          const filePath = fileParts.join(' ');
          if (status.startsWith('A')) addedFiles.push(filePath);
          else if (status.startsWith('D')) deletedFiles.push(filePath);
          else if (status.startsWith('M') || status.startsWith('R')) changedFiles.push(filePath);
        }
      } catch (err) {
        console.warn(`[GitService] Error computing git diff: ${err}`);
      }
    }

    return {
      oldCommit: oldCommit || undefined,
      newCommit,
      isIncremental: true,
      changedFiles,
      addedFiles,
      deletedFiles,
    };
  }

  /**
   * Builds file tree while ignoring symlinks to prevent traversal and host leaks.
   */
  buildFileTree(dirPath: string, rootPath: string = dirPath): FileTreeNode[] {
    if (!fs.existsSync(dirPath)) return [];

    const IGNORED = new Set([
      '.git',
      'node_modules',
      'dist',
      'build',
      '.next',
      '.venv',
      'venv',
      '__pycache__',
      '.pytest_cache',
      'coverage',
      '.DS_Store',
    ]);

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const nodes: FileTreeNode[] = [];

    const canonicalRoot = fs.realpathSync(rootPath);

    for (const entry of entries) {
      if (IGNORED.has(entry.name)) continue;

      const fullPath = path.join(dirPath, entry.name);

      // Symlink defense: inspect lstat
      try {
        const lstats = fs.lstatSync(fullPath);
        if (lstats.isSymbolicLink()) {
          // Reject symbolic links to prevent host/external directory reading
          continue;
        }

        const relPath = path.relative(canonicalRoot, fullPath);

        if (entry.isDirectory()) {
          const children = this.buildFileTree(fullPath, rootPath);
          nodes.push({
            name: entry.name,
            path: relPath,
            type: 'directory',
            children,
          });
        } else if (entry.isFile()) {
          nodes.push({
            name: entry.name,
            path: relPath,
            type: 'file',
            size: lstats.size,
          });
        }
      } catch {
        // Skip unreadable files or broken links
        continue;
      }
    }

    return nodes.sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === 'directory' ? -1 : 1;
    });
  }

  /**
   * Safely reads file content with strict path traversal, symlink, and size guards.
   */
  readFileContent(repoPath: string, relativeFilePath: string): { content: string; totalLines: number } {
    if (!relativeFilePath || typeof relativeFilePath !== 'string') {
      throw new Error('Invalid file path.');
    }

    // Strip and check null bytes
    if (relativeFilePath.includes('\0')) {
      throw new Error('Access denied: null byte detected in path.');
    }

    // Resolve target and verify against repository root
    const resolvedRepo = path.resolve(repoPath);
    const fullPath = path.resolve(resolvedRepo, relativeFilePath);

    if (!fullPath.startsWith(resolvedRepo + path.sep) && fullPath !== resolvedRepo) {
      throw new Error('Access denied: path traversal detected.');
    }

    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${relativeFilePath}`);
    }

    // Check lstat to detect symlinks
    const lstats = fs.lstatSync(fullPath);
    if (lstats.isSymbolicLink()) {
      throw new Error('Access denied: symbolic links are not permitted.');
    }

    // Check realpath to guarantee destination is within canonical repository root
    const canonicalRepo = fs.realpathSync(resolvedRepo);
    const canonicalFile = fs.realpathSync(fullPath);

    if (!canonicalFile.startsWith(canonicalRepo + path.sep) && canonicalFile !== canonicalRepo) {
      throw new Error('Access denied: path traversal detected via canonical path.');
    }

    // Enforce individual file size ceiling (1 MB)
    const MAX_FILE_SIZE = 1024 * 1024;
    if (lstats.size > MAX_FILE_SIZE) {
      throw new Error(`File too large: ${lstats.size} bytes exceeds 1MB limit.`);
    }

    const content = fs.readFileSync(fullPath, 'utf-8');
    const totalLines = content.split('\n').length;
    return { content, totalLines };
  }
}

export const gitService = new GitService();
