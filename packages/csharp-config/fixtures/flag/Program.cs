using System;
using System.Collections.Generic;
using System.Threading;
using System.Text; // flag: IDE0005
using System.Threading.Tasks;

namespace Fixture;

internal static class Program
{
    private static int Main()
    {
        var holder = new Holder();
        return holder.Run();
    }
}

internal sealed class Holder
{
    private int unusedField; // flag: IDE0051
    private int writtenOnly; // flag: IDE0052
    private int neverReassigned = 1; // flag: IDE0044
    private readonly int _underscored = 2; // flag: IDE1006
    int implicitVisibility; // flag: IDE0040
    private string? maybe;
    private readonly List<int> items = new List<int>(); // flag: IDE0090

    public int Run()
    {
        var length = maybe.Length; // flag: CS8602
        writtenOnly = 5;
        return length + Branches(1, 2) + Nested(1) + Unused(1, 2) + Many(1, 2, 3, 4, 5) + Mixed(maybe);
    }

    private int Branches(int first, int second)
    {
        if (first > 0) return 1; // flag: IDE0011
        const int limit = 10;
        var local = 10; // flag: RCS1118
        object value = first;
        if (value is int)
        {
            var cast = (int)value; // flag: IDE0020
            return cast + limit + local;
        }

        var text = value as string; // flag: IDE0019
        if (text != null)
        {
            return text.Length;
        }

        var pick = first > 0 ? (second > 0 ? limit : 0) : 0; // flag: RCS1238
        Reduce(first);
        return neverReassigned + pick;
    }

    private static int Nested(int level)
    {
        if (level > 0)
        {
            for (var i = 0; i < level; i++)
            {
                while (i < level)
                {
                    if (i == 1) // flag: S134
                    {
                        return 1;
                    }
                }
            }
        }

        return 0;
    }

    private void Reduce(int level)
    {
        if (level > 0) // flag: RCS1208
        {
            items.Add(level);
            items.Add(level);
        }
    }

    private static int Unused(int used, int unusedParameter) => used; // flag: IDE0060

    private static int Many(int one, int two, int three, int four, int five) => one + two + three + four + five; // flag: S107

    private static int Mixed(string? text)
    {
        // TODO fix this // flag: S1135
        try
        {
            if (text is null)
            {
                throw new Exception("missing"); // flag: CA2201
            }
        }
        catch (Exception) // flag: CA1031
        {
            return 0;
        }

        return text.Length;
    }

    private static void Ignored(CancellationToken token, int count) // flag: CA1068
    {
        Delay(count, token);
        Task.Delay(1, token).Wait(); // flag: RS0030
    }

    private static async Task Delay(int count, CancellationToken token)
    {
        await Task.Delay(count, token);
    }

    private static async Task Floating(int count, CancellationToken token)
    {
        Delay(count, token); // flag: CS4014
        await Task.CompletedTask;
    }

    private static List<int> Collect()
    {
        var list = new List<int>(); // flag: IDE0028
        list.Add(1);
        var other = new Holder();
        other.writtenOnly = 1; // flag: IDE0017
        return list;
    }
}

internal static class Cold
{
    private static readonly int Value;

    static Cold() // flag: CA1810
    {
        Value = 1;
    }
}

internal sealed class NeverCreated // flag: CA1812
{
}

