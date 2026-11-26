using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace DrivellaLauncher;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.Run(new LauncherForm());
    }
}

internal sealed record GameFile(string path, string sha, long size);
internal sealed record InstalledState(string treeSha, List<GameFile> files);

internal sealed class LauncherForm : Form
{
    private const string Repo = "Nikita83USSR/drivella";
    private const string Branch = "main";
    private static readonly HttpClient Http = CreateHttpClient();

    private readonly Label _headline = new();
    private readonly Label _status = new();
    private readonly ProgressBar _bar = new();
    private readonly Label _detail = new();
    private readonly string _gameRoot;
    private readonly string _current;
    private bool _started;

    public LauncherForm()
    {
        Text = "DRIVELLA";
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        ShowInTaskbar = true;
        ClientSize = new Size(540, 184);
        BackColor = Color.FromArgb(8, 8, 23);
        ForeColor = Color.FromArgb(236, 241, 255);
        Font = new Font("Consolas", 10F);

        _headline.Text = "DRIVELLA  //  PC EDITION";
        _headline.ForeColor = Color.FromArgb(255, 91, 206);
        _headline.Font = new Font("Consolas", 15F, FontStyle.Bold);
        _headline.Location = new Point(24, 18);
        _headline.AutoSize = true;

        _status.Text = "ПРОВЕРКА ОБНОВЛЕНИЙ";
        _status.ForeColor = Color.FromArgb(131, 239, 255);
        _status.Location = new Point(26, 62);
        _status.AutoSize = true;

        _bar.Location = new Point(25, 92);
        _bar.Size = new Size(490, 17);
        _bar.Style = ProgressBarStyle.Continuous;

        _detail.Text = "Подключение к GitHub...";
        _detail.ForeColor = Color.FromArgb(153, 166, 197);
        _detail.Location = new Point(26, 124);
        _detail.AutoSize = true;

        Controls.AddRange(new Control[] { _headline, _status, _bar, _detail });

        _gameRoot = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "DRIVELLA", "Game");
        _current = Path.Combine(_gameRoot, "current");
        Shown += OnFirstShown;
    }

    private static HttpClient CreateHttpClient()
    {
        var client = new HttpClient { Timeout = TimeSpan.FromMinutes(3) };
        client.DefaultRequestHeaders.UserAgent.ParseAdd("DRIVELLA-Launcher/0.1");
        client.DefaultRequestHeaders.Accept.ParseAdd("application/vnd.github+json");
        return client;
    }

    private async void OnFirstShown(object? sender, EventArgs e)
    {
        if (_started) return;
        _started = true;
        await RunLauncherAsync();
    }

    private async Task RunLauncherAsync()
    {
        try
        {
            SetProgress("ПРОВЕРКА ОБНОВЛЕНИЙ", "Получаем список файлов игры...", 0);
            InstalledState? installed = ReadInstalledState();
            List<GameFile> remoteFiles;
            string remoteTreeSha;

            try
            {
                (remoteTreeSha, remoteFiles) = await GetRemoteManifestAsync();
            }
            catch (Exception ex)
            {
                if (IsPlayableLocalCopy())
                {
                    var answer = MessageBox.Show(this,
                        "Не удалось проверить GitHub.\n\n" + ex.Message +
                        "\n\nЗапустить уже установленную версию?",
                        "DRIVELLA — нет соединения",
                        MessageBoxButtons.YesNo, MessageBoxIcon.Warning);
                    if (answer == DialogResult.Yes) LaunchGame(); else Close();
                    return;
                }
                MessageBox.Show(this,
                    "Для первой установки требуется подключение к GitHub.\n\n" + ex.Message,
                    "DRIVELLA — установка",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
                Close();
                return;
            }

            var localByPath = installed?.files.ToDictionary(x => x.path, StringComparer.Ordinal)
                              ?? new Dictionary<string, GameFile>(StringComparer.Ordinal);
            var changed = remoteFiles.Where(remote =>
            {
                string localPath = SafePath(_current, remote.path);
                return !localByPath.TryGetValue(remote.path, out var old) ||
                       !StringComparer.OrdinalIgnoreCase.Equals(old.sha, remote.sha) ||
                       !File.Exists(localPath);
            }).ToList();

            bool firstInstall = !IsPlayableLocalCopy();
            if (firstInstall)
            {
                SetProgress("ПЕРВАЯ УСТАНОВКА", "Загружаем файлы DRIVELLA...", 0);
                await InstallUpdateAsync(remoteTreeSha, remoteFiles, changed, localByPath);
                LaunchGame();
                return;
            }

            if (changed.Count == 0 && installed!.files.Count == remoteFiles.Count)
            {
                SetProgress("ВЕРСИЯ АКТУАЛЬНА", "Запускаем DRIVELLA...", 100);
                await Task.Delay(250);
                LaunchGame();
                return;
            }

            var confirm = MessageBox.Show(this,
                "На GitHub доступно обновление DRIVELLA.\n" +
                $"Изменено файлов: {changed.Count}\n\n" +
                "Установить обновление сейчас?\n\n" +
                "При отказе запустится текущая установленная версия.",
                "DRIVELLA — доступно обновление",
                MessageBoxButtons.YesNo, MessageBoxIcon.Information);

            if (confirm == DialogResult.Yes)
            {
                SetProgress("ОБНОВЛЕНИЕ ИГРЫ", "Загружаем изменённые файлы...", 0);
                await InstallUpdateAsync(remoteTreeSha, remoteFiles, changed, localByPath);
            }
            else
            {
                SetProgress("ОБНОВЛЕНИЕ ОТЛОЖЕНО", "Запускаем прежнюю версию...", 100);
                await Task.Delay(250);
            }

            LaunchGame();
        }
        catch (Exception ex)
        {
            if (IsPlayableLocalCopy())
            {
                var answer = MessageBox.Show(this,
                    "Обновление не удалось установить.\n" + ex.Message +
                    "\n\nТекущая версия не была заменена.\nЗапустить предыдущую версию?",
                    "DRIVELLA — ошибка обновления",
                    MessageBoxButtons.YesNo, MessageBoxIcon.Warning);
                if (answer == DialogResult.Yes) LaunchGame(); else Close();
            }
            else
            {
                MessageBox.Show(this, "Не удалось установить DRIVELLA.\n" + ex.Message,
                    "DRIVELLA — ошибка установки",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
                Close();
            }
        }
    }

    private async Task<(string treeSha, List<GameFile> files)> GetRemoteManifestAsync()
    {
        string url = $"https://api.github.com/repos/{Repo}/git/trees/{Branch}?recursive=1";
        using var response = await Http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead);
        response.EnsureSuccessStatusCode();
        await using var stream = await response.Content.ReadAsStreamAsync();
        using var json = await JsonDocument.ParseAsync(stream);
        var root = json.RootElement;
        if (root.TryGetProperty("truncated", out var truncated) && truncated.GetBoolean())
            throw new InvalidDataException("GitHub вернул неполный список файлов.");

        string treeSha = root.GetProperty("sha").GetString()
                         ?? throw new InvalidDataException("В ответе GitHub нет SHA дерева.");
        var files = new List<GameFile>();
        foreach (var item in root.GetProperty("tree").EnumerateArray())
        {
            if (item.GetProperty("type").GetString() != "blob") continue;
            string path = item.GetProperty("path").GetString() ?? "";
            if (path != "index.html" && !path.StartsWith("assets/", StringComparison.Ordinal))
                continue;
            files.Add(new GameFile(
                path,
                item.GetProperty("sha").GetString() ?? "",
                item.GetProperty("size").GetInt64()));
        }

        if (!files.Any(x => x.path == "index.html") || files.Count < 2)
            throw new InvalidDataException("В GitHub не найден полный комплект файлов игры.");
        return (treeSha, files);
    }

    private InstalledState? ReadInstalledState()
    {
        try
        {
            string path = Path.Combine(_current, ".drivella-manifest.json");
            if (!File.Exists(path)) return null;
            return JsonSerializer.Deserialize<InstalledState>(File.ReadAllText(path));
        }
        catch { return null; }
    }

    private bool IsPlayableLocalCopy()
    {
        try
        {
            var state = ReadInstalledState();
            return state is not null &&
                   state.files.Any(x => x.path == "index.html") &&
                   state.files.All(file =>
                   {
                       string path = SafePath(_current, file.path);
                       return File.Exists(path) && new FileInfo(path).Length == file.size;
                   });
        }
        catch { return false; }
    }

    private async Task InstallUpdateAsync(
        string treeSha,
        List<GameFile> remoteFiles,
        List<GameFile> changed,
        Dictionary<string, GameFile> localByPath)
    {
        Directory.CreateDirectory(_gameRoot);
        string staging = Path.Combine(_gameRoot, "staging-" + Guid.NewGuid().ToString("N"));
        string backup = Path.Combine(_gameRoot, "previous-" + DateTime.UtcNow.ToString("yyyyMMddHHmmss"));
        Directory.CreateDirectory(staging);
        long totalBytes = Math.Max(1, changed.Sum(x => x.size));
        long downloadedBytes = 0;
        int changedDone = 0;

        try
        {
            foreach (var file in remoteFiles)
            {
                string destination = SafePath(staging, file.path);
                Directory.CreateDirectory(Path.GetDirectoryName(destination)!);
                string oldPath = SafePath(_current, file.path);

                if (localByPath.TryGetValue(file.path, out var old) &&
                    StringComparer.OrdinalIgnoreCase.Equals(old.sha, file.sha) &&
                    File.Exists(oldPath))
                {
                    File.Copy(oldPath, destination, true);
                    continue;
                }

                string escaped = string.Join("/", file.path.Split('/').Select(Uri.EscapeDataString));
                string url = $"https://raw.githubusercontent.com/{Repo}/{Branch}/{escaped}";
                using var response = await Http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead);
                response.EnsureSuccessStatusCode();
                await using var input = await response.Content.ReadAsStreamAsync();
                await using var output = new MemoryStream();
                byte[] buffer = new byte[128 * 1024];
                int read;
                while ((read = await input.ReadAsync(buffer)) > 0)
                {
                    await output.WriteAsync(buffer.AsMemory(0, read));
                    downloadedBytes += read;
                    SetProgress("ЗАГРУЗКА ИГРЫ",
                        file.path + "  ·  " + (changedDone + 1) + "/" + changed.Count + " файлов",
                        (int)Math.Min(99, downloadedBytes * 100 / totalBytes));
                }

                byte[] bytes = output.ToArray();
                if (!StringComparer.OrdinalIgnoreCase.Equals(GitBlobSha1(bytes), file.sha))
                    throw new InvalidDataException("Контрольная сумма не совпала: " + file.path);
                await File.WriteAllBytesAsync(destination, bytes);
                changedDone++;
            }

            var state = new InstalledState(treeSha, remoteFiles);
            await File.WriteAllTextAsync(
                Path.Combine(staging, ".drivella-manifest.json"),
                JsonSerializer.Serialize(state, new JsonSerializerOptions { WriteIndented = true }),
                new UTF8Encoding(false));

            bool movedOld = false;
            if (Directory.Exists(_current))
            {
                Directory.Move(_current, backup);
                movedOld = true;
            }
            try
            {
                Directory.Move(staging, _current);
            }
            catch
            {
                if (movedOld && Directory.Exists(backup) && !Directory.Exists(_current))
                    Directory.Move(backup, _current);
                throw;
            }
            if (Directory.Exists(backup))
            {
                try { Directory.Delete(backup, true); }
                catch { /* The new active version is already committed; stale backup cleanup is non-fatal. */ }
            }
            SetProgress("ОБНОВЛЕНИЕ ЗАВЕРШЕНО", "Все файлы проверены. Запускаем игру.", 100);
        }
        catch
        {
            if (Directory.Exists(staging)) Directory.Delete(staging, true);
            throw;
        }
    }

    private static string GitBlobSha1(byte[] bytes)
    {
        byte[] header = Encoding.ASCII.GetBytes("blob " + bytes.Length + "\0");
        byte[] payload = new byte[header.Length + bytes.Length];
        Buffer.BlockCopy(header, 0, payload, 0, header.Length);
        Buffer.BlockCopy(bytes, 0, payload, header.Length, bytes.Length);
        return Convert.ToHexString(SHA1.HashData(payload)).ToLowerInvariant();
    }

    private static string SafePath(string root, string relative)
    {
        if (Path.IsPathRooted(relative) || relative.Split('/', '\\').Any(x => x == ".."))
            throw new InvalidDataException("Недопустимый путь файла: " + relative);
        string fullRoot = Path.GetFullPath(root) + Path.DirectorySeparatorChar;
        string fullPath = Path.GetFullPath(Path.Combine(root, relative.Replace('/', Path.DirectorySeparatorChar)));
        if (!fullPath.StartsWith(fullRoot, StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException("Путь выходит за пределы каталога игры.");
        return fullPath;
    }

    private void LaunchGame()
    {
        string host = Path.Combine(AppContext.BaseDirectory, "DrivellaGame.exe");
        if (!File.Exists(host))
        {
            MessageBox.Show(this, "Не найден игровой компонент DrivellaGame.exe.\nПереустановите DRIVELLA.",
                "DRIVELLA", MessageBoxButtons.OK, MessageBoxIcon.Error);
            Close();
            return;
        }

        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = host,
                Arguments = "--game-dir=\"" + _current + "\"",
                WorkingDirectory = AppContext.BaseDirectory,
                UseShellExecute = true
            });
            Close();
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, "Не удалось запустить игру.\n" + ex.Message,
                "DRIVELLA", MessageBoxButtons.OK, MessageBoxIcon.Error);
            Close();
        }
    }

    private void SetProgress(string headline, string detail, int percent)
    {
        if (IsDisposed) return;
        _status.Text = headline;
        _detail.Text = detail;
        _bar.Value = Math.Clamp(percent, 0, 100);
        Refresh();
    }
}
