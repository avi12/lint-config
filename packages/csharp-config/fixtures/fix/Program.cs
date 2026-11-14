using System;
using System.Collections.Generic;

namespace Fixture;

internal static class Program
{
    static int Main()
    {
        if (Environment.TickCount > 0) return 1;
        return 0;
    }

    private static void BoundByMarkup(object sender, EventArgs e)
    {
    }
}
